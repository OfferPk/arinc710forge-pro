/**
 * ARINC710Forge Pro (v1.0.0) - Core Airborne Instrument Landing System (ILS) Receiver Engine
 * Implements ARINC Characteristic 710, RTCA DO-195 (Localizer), RTCA DO-192 (Glideslope), and ICAO Annex 10 Vol I
 */

class ARINC710Engine {
  constructor() {
    // ARINC 429 Labels in Octal
    this.LABELS = {
      LOC_DEVIATION: 0o173,
      GS_DEVIATION: 0o174,
      SELECTED_FREQ: 0o033,
      DISCRETE_STATUS: 0o270,
      BITE_FAULT: 0o350
    };

    // Standard ICAO ILS Frequency Pairing (VHF Localizer <-> UHF Glideslope)
    this.FREQUENCY_PAIRS = {
      '108.10': 334.70,
      '108.15': 334.55,
      '108.30': 334.10,
      '108.50': 329.90,
      '108.70': 330.50,
      '108.90': 331.10,
      '109.10': 331.40,
      '109.30': 332.00,
      '109.50': 332.60,
      '109.70': 333.20,
      '109.90': 333.80,
      '110.10': 334.40,
      '110.30': 335.00,
      '110.50': 329.60,
      '110.70': 330.20,
      '110.90': 330.80,
      '111.10': 331.70,
      '111.30': 332.30,
      '111.50': 332.90,
      '111.70': 333.50,
      '111.90': 331.10,
      '111.95': 330.95
    };

    // Receiver State
    this.selectedLocFreq = '109.30'; // MHz
    this.activeGsFreq = 332.00;      // MHz

    // Localizer State
    this.locDdm = 0.000;             // DDM (-0.155 to +0.155)
    this.locDots = 0.0;              // -2.0 to +2.0 dots
    this.locFlag = false;            // Warning flag

    // Glideslope State
    this.gsDdm = 0.000;              // DDM (-0.175 to +0.175)
    this.gsDots = 0.0;               // -2.0 to +2.0 dots
    this.gsFlag = false;             // Warning flag

    // Marker Beacons State
    this.markerActive = null;        // 'OUTER', 'MIDDLE', 'INNER', or null

    // Autoland Category Readiness
    this.autolandCat = 'CAT_IIIb';   // 'CAT_I', 'CAT_II', 'CAT_IIIa', 'CAT_IIIb'
  }

  /**
   * Set Localizer Frequency and Automatically Pair UHF Glideslope Frequency
   */
  tuneFrequency(freqMhz) {
    const fStr = parseFloat(freqMhz).toFixed(2);
    if (!this.FREQUENCY_PAIRS.hasOwnProperty(fStr)) {
      throw new Error(`Frequency ${freqMhz} MHz is not a standardized ICAO ILS Localizer channel`);
    }
    this.selectedLocFreq = fStr;
    this.activeGsFreq = this.FREQUENCY_PAIRS[fStr];
    return {
      loc_freq_mhz: parseFloat(this.selectedLocFreq),
      gs_freq_mhz: this.activeGsFreq,
      status: 'TUNED_PAIRED'
    };
  }

  /**
   * Compute Localizer Difference in Depth of Modulation (DDM) & Deviation Dots
   * @param {number} m90 - 90 Hz tone modulation percentage (nominal 20%)
   * @param {number} m150 - 150 Hz tone modulation percentage (nominal 20%)
   */
  calculateLocDeviation(m90, m150) {
    const sdm = (m90 + m150) / 100.0;
    // Low signal or out of spec SDM triggers LOC warning flag
    if (sdm < 0.25 || sdm > 0.60) {
      this.locFlag = true;
      this.locDdm = 0.0;
      this.locDots = 0.0;
      return { ddm: 0, dots: 0, flag: true, reason: 'LOCALIZER_SDM_OUT_OF_SPEC' };
    }

    this.locFlag = false;
    this.locDdm = (m150 - m90) / 100.0;
    // Full scale deflection is DDM = 0.155 (2.0 dots per ICAO Annex 10)
    this.locDots = Math.max(-2.5, Math.min(2.5, (this.locDdm / 0.155) * 2.0));

    return {
      ddm: parseFloat(this.locDdm.toFixed(4)),
      dots: parseFloat(this.locDots.toFixed(2)),
      fly_direction: (this.locDots < -0.1) ? 'FLY_LEFT' : (this.locDots > 0.1 ? 'FLY_RIGHT' : 'ON_COURSE'),
      flag: false
    };
  }

  /**
   * Compute Glideslope Difference in Depth of Modulation (DDM) & Deviation Dots
   * @param {number} m90 - 90 Hz tone modulation percentage (nominal 40%)
   * @param {number} m150 - 150 Hz tone modulation percentage (nominal 40%)
   */
  calculateGsDeviation(m90, m150) {
    const sdm = (m90 + m150) / 100.0;
    // Low signal or out of spec SDM triggers GS warning flag
    if (sdm < 0.50 || sdm > 1.10) {
      this.gsFlag = true;
      this.gsDdm = 0.0;
      this.gsDots = 0.0;
      return { ddm: 0, dots: 0, flag: true, reason: 'GLIDESLOPE_SDM_OUT_OF_SPEC' };
    }

    this.gsFlag = false;
    this.gsDdm = (m150 - m90) / 100.0;
    // Full scale deflection is DDM = 0.175 (2.0 dots per ICAO Annex 10)
    this.gsDots = Math.max(-2.5, Math.min(2.5, (this.gsDdm / 0.175) * 2.0));

    return {
      ddm: parseFloat(this.gsDdm.toFixed(4)),
      dots: parseFloat(this.gsDots.toFixed(2)),
      fly_direction: (this.gsDots < -0.1) ? 'FLY_UP' : (this.gsDots > 0.1 ? 'FLY_DOWN' : 'ON_GLIDEPATH'),
      flag: false
    };
  }

  /**
   * Trigger Marker Beacon Passage (Outer, Middle, Inner)
   */
  setMarkerBeacon(type) {
    if (['OUTER', 'MIDDLE', 'INNER', null].includes(type)) {
      this.markerActive = type;
      const markerInfo = {
        'OUTER': { tone_hz: 400, color: 'BLUE', keying: '2 dashes/sec (4-7 NM to threshold)' },
        'MIDDLE': { tone_hz: 1300, color: 'AMBER', keying: 'dot-dash (Cat I DH ~200ft)' },
        'INNER': { tone_hz: 3000, color: 'WHITE', keying: '6 dots/sec (Cat II DH ~100ft)' },
        null: { tone_hz: 0, color: 'NONE', keying: 'INACTIVE' }
      };
      return markerInfo[type];
    }
    throw new Error('Invalid Marker Beacon Type');
  }

  /**
   * ARINC 429 Bit 32 Odd Parity Calculator
   */
  calculateParity(word31Bits) {
    let count = 0;
    let temp = word31Bits & 0x7FFFFFFF;
    while (temp) {
      count += temp & 1;
      temp >>= 1;
    }
    return (count % 2 === 0) ? 1 : 0;
  }

  /**
   * Reverse 8-bit octal label to ARINC 429 transmission order
   */
  reverseLabelBits(octalLabel) {
    let rev = 0;
    for (let i = 0; i < 8; i++) {
      rev = (rev << 1) | ((octalLabel >> i) & 1);
    }
    return rev;
  }

  /**
   * Encode 32-bit ARINC 429 Word with Bit 32 Odd Parity
   */
  encodeWord(octalLabel, sdi, dataBits, ssm) {
    const revLabel = this.reverseLabelBits(octalLabel) & 0xFF;
    const sdiField = (sdi & 0x03) << 8;
    const dataField = (dataBits & 0x7FFFF) << 10;
    const ssmField = (ssm & 0x03) << 29;

    let word = revLabel | sdiField | dataField | ssmField;
    const parity = this.calculateParity(word);
    word |= (parity << 31);
    return word >>> 0;
  }

  /**
   * Decode 32-bit ARINC 429 Word
   */
  decodeWord(word32) {
    const parity = (word32 >>> 31) & 1;
    const wordWithoutParity = word32 & 0x7FFFFFFF;
    const expectedParity = this.calculateParity(wordWithoutParity);
    const parityValid = (parity === expectedParity);

    const ssm = (word32 >>> 29) & 0x03;
    const data = (word32 >>> 10) & 0x7FFFF;
    const sdi = (word32 >>> 8) & 0x03;
    const rawLabel = word32 & 0xFF;

    let octalLabel = 0;
    for (let i = 0; i < 8; i++) {
      octalLabel = (octalLabel << 1) | ((rawLabel >> i) & 1);
    }

    const ssmMap = {
      0x03: 'Normal Operation',
      0x00: 'Failure Warning (Flag Active)',
      0x01: 'No Computed Data (NCD)',
      0x02: 'Functional Test'
    };

    return {
      word_hex: '0x' + (word32 >>> 0).toString(16).toUpperCase().padStart(8, '0'),
      octal_label: '0' + octalLabel.toString(8).padStart(3, '0'),
      sdi,
      data,
      ssm,
      ssm_meaning: ssmMap[ssm] || 'Unknown',
      parity_valid: parityValid
    };
  }

  /**
   * Encode Localizer Deviation Word (Label 173) in Binary (BNR) Format
   */
  encodeLocWord(dots, flagActive = false) {
    // 12-bit BNR encoding: Full scale 2.0 dots = 0x7FF (2047 counts)
    const clampedDots = Math.max(-2.5, Math.min(2.5, dots));
    const counts = Math.round((clampedDots / 2.0) * 1024) & 0x7FFFF;
    const ssm = flagActive ? 0x00 : 0x03; // Failure warning if flag active
    return this.encodeWord(this.LABELS.LOC_DEVIATION, 0, counts, ssm);
  }

  /**
   * Encode Glideslope Deviation Word (Label 174) in Binary (BNR) Format
   */
  encodeGsWord(dots, flagActive = false) {
    const clampedDots = Math.max(-2.5, Math.min(2.5, dots));
    const counts = Math.round((clampedDots / 2.0) * 1024) & 0x7FFFF;
    const ssm = flagActive ? 0x00 : 0x03;
    return this.encodeWord(this.LABELS.GS_DEVIATION, 0, counts, ssm);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ARINC710Engine };
}
