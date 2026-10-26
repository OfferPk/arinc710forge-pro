# ARINC 710 Mark 2 Airborne Instrument Landing System (ILS) Receiver Specification

**Document Reference**: SPEC-ARINC710-ILS-001  
**Version**: 1.0.0  
**Classification**: Commercial Avionics Engineering & Certification Guide

## 1\. System Overview

ARINC Characteristic 710 defines the form, fit, function, and electrical interfaces for the Mark 2 Airborne Instrument Landing System (ILS) Receiver. Operating under RTCA DO-195 (Localizer MOPS), RTCA DO-192 (Glideslope MOPS), and ICAO Annex 10 Volume I Chapter 3, the ILS receiver provides precision lateral and vertical runway guidance for commercial transport airliners, enabling all-weather Category I, Category II, and Category IIIa/b/c automatic landings down to 0 ft decision height and 75m runway visual range (RVR).

## 2\. Core Functional Requirements

1. **Frequency Allocation & Automated Pairing**:  
   - VHF Localizer: 108.10 MHz to 111.95 MHz (40 channels on odd tenths and hundredths).  
   - UHF Glideslope: 329.15 MHz to 335.00 MHz automatically paired to the tuned VHF channel.  
2. **Localizer Signal Demodulation & DDM**:  
   - 90 Hz (left) and 150 Hz (right) AM modulation sidebands.  
   - Difference in Depth of Modulation: \$	ext{DDM} \= (m\_{150} \- m\_{90}) / 100%\$.  
   - Runway Centerline: \$	ext{DDM} \= 0.000\$ (0.0 dots).  
   - Full-Scale Deflection: \$	ext{DDM} \= \\pm 0.155\$ corresponds to \$\\pm 2.0\$ dots (\$\\pm 2.5^\\circ\$ course sector).  
3. **Glideslope Signal Demodulation & DDM**:  
   - 90 Hz (above) and 150 Hz (below) AM modulation sidebands.  
   - Nominal \$3.0^\\circ\$ Glide Path: \$	ext{DDM} \= 0.000\$ (0.0 dots).  
   - Full-Scale Deflection: \$	ext{DDM} \= \\pm 0.175\$ corresponds to \$\\pm 2.0\$ dots (\$\\pm 0.7^\\circ\$ path sector).  
4. **75.0 MHz Marker Beacon Receiver**:  
   - Outer Marker (OM): 400 Hz tone, 2 dashes/sec, blue visual lamp (4–7 NM from threshold).  
   - Middle Marker (MM): 1300 Hz tone, dot-dash, amber visual lamp (Category I DH \~200 ft).  
   - Inner Marker (IM): 3000 Hz tone, 6 dots/sec, white visual lamp (Category II DH \~100 ft).  
5. **ARINC 429 Bus Telemetry**:  
   - Strict Bit 32 odd parity across Labels 173 (LOC Deviation), 174 (GS Deviation), 033 (Frequency Tuning), 270 (Discrete Status), and 350 (BITE Fault).