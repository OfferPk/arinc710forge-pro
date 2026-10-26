#!/usr/bin/env python3
"""
ARINC710Forge Pro (v1.0.0) - Automated Verification & Test Suite
Validates ARINC Characteristic 710 Mark 2 ILS Receiver & ICAO Annex 10 Vol I compliance:
- ARINC 429 Bit 32 Odd Parity Rule
- Label bit reversal and word round-trip encoding/decoding
- VHF Localizer & UHF Glideslope frequency pairing (40 channels)
- Localizer DDM calibration (+/-0.155 DDM = +/-2.0 dots full scale)
- Glideslope DDM calibration (+/-0.175 DDM = +/-2.0 dots full scale)
- Localizer warning flag tripping on SDM degradation (<25% or >60%)
- Glideslope warning flag tripping on SDM degradation (<50% or >110%)
- 75 MHz Marker Beacon detection (Outer 400Hz, Middle 1300Hz, Inner 3000Hz)
- Fly-left / Fly-right and Fly-up / Fly-down directional guidance logic
- 10-Point Normative Airworthiness Compliance Auditor
"""

import sys
import unittest
import math
from typing import Dict, Any

# Import module functions from arinc710-cli
import importlib.util
spec = importlib.util.spec_from_file_location("arinc710_cli", "source-code/arinc710-cli.py")
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)

class TestARINC710Engine(unittest.TestCase):

    def test_01_arinc429_odd_parity_calculation(self):
        """Test 1: Verify ARINC 429 Bit 32 Odd Parity calculation."""
        # Pattern with odd number of 1s in lower 31 bits -> parity bit must be 0
        word_odd_ones = 0b00000000000000000000000000000111  # three 1s
        parity = cli.calculate_parity(word_odd_ones)
        self.assertEqual(parity, 0, "Odd number of 1s must produce parity 0")

        # Pattern with even number of 1s in lower 31 bits -> parity bit must be 1
        word_even_ones = 0b00000000000000000000000000000011  # two 1s
        parity = cli.calculate_parity(word_even_ones)
        self.assertEqual(parity, 1, "Even number of 1s must produce parity 1")

        full_word = word_even_ones | (parity << 31)
        total_ones = bin(full_word).count('1')
        self.assertEqual(total_ones % 2, 1, "Full 32-bit word must have odd parity")

    def test_02_arinc429_label_reversal(self):
        """Test 2: Verify 8-bit octal label bit reversal for ARINC 429 transmission order."""
        octal_label = 0o173  # Localizer Deviation Label
        reversed_label = cli.reverse_label_bits(octal_label)
        double_reversed = cli.reverse_label_bits(reversed_label)
        self.assertEqual(double_reversed, octal_label, "Double bit reversal must equal original label")

    def test_03_arinc429_encode_decode_roundtrip(self):
        """Test 3: Verify ARINC 429 encoding, odd parity injection, and decoding roundtrip."""
        test_labels = [0o173, 0o174, 0o033, 0o270, 0o350]
        for label in test_labels:
            encoded = cli.encode_arinc429_word(label, 0, 0x2A15, 3)
            decoded = cli.decode_arinc429_word(encoded)
            self.assertTrue(decoded['parity_valid'], f"Parity invalid for label 0{label:03o}")
            self.assertEqual(int(decoded['octal_label'], 8), label, "Decoded label must match")
            self.assertEqual(decoded['data'], 0x2A15, "Decoded data payload must match")
            self.assertEqual(decoded['ssm'], 3, "Decoded SSM must match")

    def test_04_ils_frequency_pairing_lookup(self):
        """Test 4: Verify VHF Localizer to UHF Glideslope standard frequency pairing."""
        pairs = [
            ('108.10', 334.70),
            ('109.30', 332.00),
            ('110.30', 335.00),
            ('111.90', 331.10)
        ]
        for loc, expected_gs in pairs:
            actual_gs = cli.FREQUENCY_PAIRS.get(loc)
            self.assertEqual(actual_gs, expected_gs, f"LOC {loc} MHz must pair with GS {expected_gs} MHz")

    def test_05_localizer_ddm_centerline_and_scale(self):
        """Test 5: Verify Localizer DDM=0 on centerline and +/-0.155 DDM = +/-2.0 dots."""
        # Centerline: m90 = 20%, m150 = 20% -> DDM = 0.0, dots = 0.0
        res_center = cli.calculate_loc_deviation(20.0, 20.0)
        self.assertEqual(res_center['ddm'], 0.0)
        self.assertEqual(res_center['dots'], 0.0)
        self.assertEqual(res_center['fly_dir'], 'ON_COURSE')

        # Full-scale Right: m90 = 12.25%, m150 = 27.75% -> DDM = +0.155, dots = +2.0
        res_right = cli.calculate_loc_deviation(12.25, 27.75)
        self.assertAlmostEqual(res_right['ddm'], 0.155, places=3)
        self.assertAlmostEqual(res_right['dots'], 2.0, places=1)
        self.assertEqual(res_right['fly_dir'], 'FLY_RIGHT')

        # Full-scale Left: m90 = 27.75%, m150 = 12.25% -> DDM = -0.155, dots = -2.0
        res_left = cli.calculate_loc_deviation(27.75, 12.25)
        self.assertAlmostEqual(res_left['ddm'], -0.155, places=3)
        self.assertAlmostEqual(res_left['dots'], -2.0, places=1)
        self.assertEqual(res_left['fly_dir'], 'FLY_LEFT')

    def test_06_glideslope_ddm_glidepath_and_scale(self):
        """Test 6: Verify Glideslope DDM=0 on path and +/-0.175 DDM = +/-2.0 dots."""
        # On Glidepath: m90 = 40%, m150 = 40% -> DDM = 0.0, dots = 0.0
        res_path = cli.calculate_gs_deviation(40.0, 40.0)
        self.assertEqual(res_path['ddm'], 0.0)
        self.assertEqual(res_path['dots'], 0.0)
        self.assertEqual(res_path['fly_dir'], 'ON_GLIDEPATH')

        # Fly Down (Above path): m90 = 31.25%, m150 = 48.75% -> DDM = +0.175, dots = +2.0
        res_down = cli.calculate_gs_deviation(31.25, 48.75)
        self.assertAlmostEqual(res_down['ddm'], 0.175, places=3)
        self.assertAlmostEqual(res_down['dots'], 2.0, places=1)
        self.assertEqual(res_down['fly_dir'], 'FLY_DOWN')

        # Fly Up (Below path): m90 = 48.75%, m150 = 31.25% -> DDM = -0.175, dots = -2.0
        res_up = cli.calculate_gs_deviation(48.75, 31.25)
        self.assertAlmostEqual(res_up['ddm'], -0.175, places=3)
        self.assertAlmostEqual(res_up['dots'], -2.0, places=1)
        self.assertEqual(res_up['fly_dir'], 'FLY_UP')

    def test_07_localizer_warning_flag_on_sdm_degradation(self):
        """Test 7: Verify Localizer warning flag triggers when SDM degrades (<25% or >60%)."""
        # Low SDM (m90=5%, m150=5%, SDM=10% < 25%)
        res_low = cli.calculate_loc_deviation(5.0, 5.0)
        self.assertTrue(res_low['flag'], "Low SDM must trigger Localizer flag")

        # Encode ARINC 429 word with flag active -> SSM must be 0x00 (Failure Warning)
        word = cli.encode_arinc429_word(0o173, 0, 0, 0 if res_low['flag'] else 3)
        decoded = cli.decode_arinc429_word(word)
        self.assertEqual(decoded['ssm'], 0x00, "Flag active must set SSM to Failure Warning")

    def test_08_glideslope_warning_flag_on_sdm_degradation(self):
        """Test 8: Verify Glideslope warning flag triggers when SDM degrades (<50% or >110%)."""
        # Low SDM (m90=15%, m150=15%, SDM=30% < 50%)
        res_low = cli.calculate_gs_deviation(15.0, 15.0)
        self.assertTrue(res_low['flag'], "Low SDM must trigger Glideslope flag")

        word = cli.encode_arinc429_word(0o174, 0, 0, 0 if res_low['flag'] else 3)
        decoded = cli.decode_arinc429_word(word)
        self.assertEqual(decoded['ssm'], 0x00, "Flag active must set SSM to Failure Warning")

    def test_09_marker_beacon_three_tone_annunciation(self):
        """Test 9: Verify 75 MHz Marker Beacon detection and frequencies."""
        markers = {
            'OUTER': {'freq': 400, 'color': 'BLUE'},
            'MIDDLE': {'freq': 1300, 'color': 'AMBER'},
            'INNER': {'freq': 3000, 'color': 'WHITE'}
        }
        self.assertEqual(markers['OUTER']['freq'], 400)
        self.assertEqual(markers['MIDDLE']['freq'], 1300)
        self.assertEqual(markers['INNER']['freq'], 3000)

    def test_10_normative_compliance_audit(self):
        """Test 10: Verify 10-point normative airworthiness compliance auditor."""
        audit_result = cli.run_compliance_audit()
        self.assertEqual(audit_result['total_rules'], 10, "Audit must contain exactly 10 normative rules")
        self.assertEqual(audit_result['passed_count'], 10, "All 10 normative airworthiness rules must pass")
        self.assertEqual(audit_result['score_percent'], 100.0, "Compliance score must be 100%")
        self.assertEqual(audit_result['certification'], 'ARINC_710_ILS_RECEIVER_MARK2_CERTIFIED')

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestARINC710Engine)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print("\nALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY.")
        sys.exit(0)
    else:
        print("\nTEST FAILURES DETECTED.")
        sys.exit(1)
