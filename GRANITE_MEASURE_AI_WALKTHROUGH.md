# GraniteMeasure AI - Comprehensive User Walkthrough

## Executive Summary

**GraniteMeasure AI** is an intelligent granite block measurement and analysis platform that transforms traditional granite quarry operations through digital transformation. The system uses computer vision, photogrammetry, and AI-powered analysis to provide accurate, defensible measurements for blockchain-style granite governance, seigniorage assessment, and cutting optimization.

---

## 1. Introduction

### 1.1 What is GraniteMeasure AI?

GraniteMeasure AI is a mobile-first platform that enables quarry operators, government officials, and stone processors to:

- **Capture** granite block dimensions using smartphone cameras
- **Measure** dimensions with centimeter-level accuracy using AI-powered photogrammetry
- **Verify** measurements through multi-view 3D reconstruction
- **Optimize** cutting patterns and estimate usable yield
- **Assess** seigniorage and tax obligations automatically

### 1.2 Why Block Measurement Matters

For granite quarry departments, accurate block measurement is the **core pain point**:

- Traditional tape-measure methods are error-prone and subjective
- Disputes over dimensions lead to revenue leakage
- Manual recording creates audit trail vulnerabilities
- No digital record for blockchain-style governance
- Cutting decisions made without accurate geometry

**GraniteMeasure AI solves these problems through:**
- Evidence-based digital twin creation
- Multi-view photogrammetric reconstruction
- Automated, auditable measurement records
- AI-powered yield optimization

---

## 2. System Architecture Overview

### 2.1 Platform Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE (Frontend)                    │
│  • Next.js Web Application                                          │
│  • Mobile-optimized Progressive Web App (PWA)                      │
│  • Android Native App (Capacitor)                                   │
│  • Telugu + English Localization                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (Backend)                        │
│  • FastAPI REST API (Port 8000)                                     │
│  • PostgreSQL Database with SQLAlchemy ORM                          │
│  • Redis for Caching and Task Queue                                 │
│  • CORS-enabled for multi-origin access                            │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         AI ANALYSIS ENGINE                           │
│  • Multi-View Photogrammetry (OpenCV)                              │
│  • Granite Detection (YOLOv8)                                       │
│  • Segment Anything (YOLOv8 Segmentation)                          │
│  • Defect Detection (YOLOv8)                                        │
│  • Calibration (Aruco Markers, Measurement Board, Manual Reference) │
│  • Geometry Reconstruction & Volume Estimation                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
1. BLOCK CREATION
   User → Block Registration form → Backend API → Database
   
2. CAPTURE SESSION INITIATION
   User → Session Creation → Database (status: OPEN)
   
3. EVIDENCE CAPTURE
   User → Capture 10+ photos → Upload with GPS metadata → Validation
   
4. IMAGE VALIDATION
   Backend → AI Detection → Quality Checks → Accept/Reject
   
5. ANALYSIS JOB SUBMISSION
   User → Submit for Analysis → Backend → Analysis Queue
   
6. 3D RECONSTRUCTION & MEASUREMENT
   AI Engine → Multi-view processing → Dimensions → Volume → Yield
   
7. REPORTING & VERIFICATION
   Results → Dashboard → Manual Verification → Seigniorage Calculation
```

---

## 3. Core Workflow: Block Measurement (The Department's Pain Point)

### 3.1 Step-by-Step Workflow

#### **STEP 1: Block Registration**

**Access:** `/blocks` → **"New Analysis"** button or Dashboard → **"New Granite Analysis"**

**What Happens:**
```
1. User selects Quarry (from registered quarry network)
2. User selects Granite Category (e.g., Red Galaxy, White Galaxy)
3. User enters Block Code (auto-generated or manual)
4. User captures GPS coordinates (optional, for field verification)
5. System creates permanent block record with unique ID
6. Database write: granite_blocks table with status="REGISTERED"
```

**API Endpoint:**
```http
POST /api/v1/granite-blocks
{
  "block_code": "GR-2024-001",
  "quarry_id": "uuid-here",
  "granite_category_id": "uuid-here",
  "capture_date": "2024-10-01T10:00:00Z",
  "gps": {"latitude": 17.3850, "longitude": 78.4867, "accuracy": 5.0},
  "notes": "North face quarry, phase 3"
}
```

**Database Record:**
```sql
INSERT INTO granite_blocks (
  block_code, quarry_id, granite_category_id, capture_date,
  operator_id, latitude, longitude, gps_accuracy_m, status
) VALUES (
  'GR-2024-001', 'quarry-uuid', 'category-uuid', NOW(),
  'operator-uuid', 17.3850, 78.4867, 5.0, 'REGISTERED'
);
```

**Why This Matters for Departments:**
- **Permanent Record**: Every block gets a unique, immutable code
- **GPS Verification**: Field location recorded for audit
- **Category Tracking**: Enables seigniorage by granite type
- **Operator Accountability**: Records who registered the block

---

#### **STEP 2: Capture Session Setup**

**What Happens:**
```
1. System creates capture_session record (status: OPEN)
2. Calibration method selection:
   - MANUAL_REFERENCE: User enters known reference size (cm) & pixel length
   - ARUCO: Uses Aruco marker detection from image
   - MEASUREMENT_BOARD: Uses calibrated board in scene
3. Session metadata stored with capture strategy configuration
4. Block status auto-updated to: CAPTURE_IN_PROGRESS
```

**Calibration Methods Explained:**

| Method | How It Works | When to Use |
|--------|-------------|-------------|
| **Manual Reference** | User specifies a physical object size (e.g., 10cm ruler) and its pixel width in first photo | Quick setup, no markers needed |
| **Aruco Marker** | Detects Aruco square markers in scene, calculates cm/pixel from marker size | Controlled environments, pre-placed markers |
| **Measurement Board** | Detects calibrated board with known dimensions | Laboratory settings, high precision |

**API Example:**
```http
POST /api/v1/capture-sessions
{
  "block_id": "block-uuid",
  "calibration_type": "MANUAL_REFERENCE",
  "known_reference_cm": 10.0,
  "reference_pixels": 150,
  "session_metadata": {
    "capture_mode": "FLEXIBLE_POSITIONAL",
    "recommended_minimum_evidence": 5,
    "available_capture_views": ["FRONT", "BACK", "LEFT", "RIGHT", ...]
  }
}
```

---

#### **STEP 3: Guided Evidence Capture (The Heart of Accuracy)**

**What Makes This Unique:**

Most measurement systems just take "some photos." GraniteMeasure AI uses **AI-guided capture** to ensure complete 360° evidence:

**Guided Views Required:**
```
REQUIRED CORE VIEWS (5 minimum):
1. FRONT - Main visible face, full block boundary
2. BACK - Rear surface, cracks, protrusions
3. LEFT - Complete left side
4. RIGHT - Complete right side
5. TOP - Elevated/top view (safety first)

BRIDGE VIEWS (AI-requested if overlap weak):
6. FRONT_RIGHT - Oblique 30-45° right
7. BACK_RIGHT - Oblique rear-right
8. BACK_LEFT - Oblique rear-left
9. FRONT_LEFT - Oblique front-left
10. BOTTOM - Only if directly visible (optional)
```

**User Experience:**

```
┌─────────────────────────────────────────────────────────┐
│  AI Guidance Panel                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Next View: FRONT_RIGHT                            │  │
│  │  Hint: "Move 30-45° clockwise, keep overlap       │  │
│  │         with front texture and corner.            │  │
│  │         Ensure full granite boundary in frame."   │  │
│  │                                                    │  │
│  │  [CAMERA PREVIEW HERE]                             │  │
│  │                                                    │  │
│  │  ✓ FRONT (captured)  ✗ BACK (missing)             │  │
│  │  ✓ LEFT (captured)   ✓ RIGHT (captured)           │  │
│  │  ○ TOP (pending)                                    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  [CAPTURE BUTTON]  [UPLOAD PHOTO]  [SKIP VIEW]          │
└─────────────────────────────────────────────────────────┘
```

**What Happens on Each Photo:**

1. **File Upload**: Image sent to `/api/v1/capture-sessions/{id}/images`
2. **Storage**: Saved to `/storage/original/{block_id}/{session_id}/{side}-{filename}`
3. **Database Write**: `block_images` table with metadata
4. **Validation Trigger**: `/api/v1/images/{image_id}/validate` runs automatically

**Validation Checks Performed:**

```python
# Backend validation pipeline (app/services/image_validation.py)

1. GRANITE DETECTION
   - YOLOv8 granite detector runs on image
   - Must detect granite with confidence > threshold
   - Reject: "NOT_GRANITE" if block not detected
   
2. QUALITY ASSESSMENT
   - Blur detection (Laplacian variance)
   - Exposure check (histogram analysis)
   - Noise level evaluation
   
3. CALIBRATION VERIFICATION
   - Aruco marker detection (if using marker method)
   - Reference object visibility check
   
4. DUPLICATE DETECTION
   - Perceptual hashing against existing images
   - Reject if too similar to existing view
   
5. OVERLAP VERIFICATION
   - Feature matching with existing accepted images
   - Ensure sufficient texture overlap for reconstruction
   - Reject: "WEAK_OVERLAP" if insufficient match
   
6. VIEW MISMATCH DETECTION
   - Verify uploaded side matches requested side
   - Reject: "VIEW_MISMATCH" if wrong angle
```

**Validation API Response:**
```json
{
  "id": "validation-uuid",
  "image_id": "image-uuid",
  "is_granite": true,
  "detection_confidence": 0.94,
  "quality_score": 0.87,
  "calibration_detected": false,
  "accepted": true,
  "rejected": false,
  "issues": [],
  "detection_provider": "yolov8n_granite_v1",
  "quality_method": "opencv_heuristic"
}
```

**If Rejected:**
```json
{
  "accepted": false,
  "rejected": true,
  "issues": [
    "Blur detected: Laplacian variance 45.2 < threshold 100",
    "Weak feature overlap with existing images"
  ],
  "error_code": "BLUR_WEAK_OVERLAP"
}
```

**User Feedback:**
```
❌ Image Rejected
"Blur detected. Hold phone steady, keep granite sharp."

[RETAKE] [CANCEL]
```

---

#### **STEP 4: Complete Capture & Submit for Analysis**

**When to Complete:**
```
MINIMUM REQUIREMENTS:
✓ At least 5 accepted images (different sides)
✓ Full 360° coverage recommended (8-10 images)
✓ GPS captured (optional but recommended for audit)

AI-REQUESTED WORKFLOW:
- After 5 core views, AI may request bridge views
- AI checks feature overlap between images
- If overlap weak, AI requests specific missing views
- User can: (1) Add bridge view, (2) Mark surface inaccessible
```

**Complete Session API:**
```http
POST /api/v1/capture-sessions/{session_id}/complete
```

**Backend Validation:**
```python
# Backend checks before completion
accepted_images = get_accepted_images(session_id)
if len(accepted_images) < 5:
    raise HTTPException(400, "Fewer than 5 accepted images")
    
required_sides = {"FRONT", "BACK", "LEFT", "RIGHT"}
captured_sides = {img.capture_side for img in accepted_images}
missing = required_sides - captured_sides
if missing:
    raise HTTPException(400, f"Missing required sides: {missing}")
```

**On Completion:**
1. Session status → `COMPLETE`
2. Block status → `READY_FOR_ANALYSIS`
3. Analysis job triggers automatically

---

#### **STEP 5: AI-Powered 3D Reconstruction & Measurement**

**What Happens in the Analysis Engine:**

```
┌──────────────────────────────────────────────────────────────────┐
│                    ANALYSIS PIPELINE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. VALIDATING IMAGES                                            │
│     • Verify all accepted images are valid granite               │
│     • Check validation results exist for each                    │
│     • Minimum 5 accepted images required                         │
│                                                                   │
│  2. DETECTING GRANITE                                            │
│     • YOLOv8 granite detector runs on each image                 │
│     • Rejects if any image doesn't contain granite               │
│                                                                   │
│  3. SEGMENTING GRANITE                                           │
│     • YOLOv8 segmentation creates mask for each image            │
│     • Extracts granite silhouette for reconstruction             │
│     • Optional step if model unconfigured, falls back to        │
│       contour-based segmentation                                 │
│                                                                   │
│  4. CHECKING CALIBRATION                                         │
│     • Aruco: Detect markers, calculate cm/pixel                  │
│     • Measurement Board: Detect board, extract scale            │
│     • Manual Reference: Use user-provided ratio                  │
│     • CRITICAL: Measurement fails without valid calibration     │
│     Output: cm_per_pixel = 0.25 (example)                       │
│                                                                   │
│  5. MATCHING FEATURES                                            │
│     •ORB/SIFT feature extraction from each image                 │
│     •Feature matching across image pairs                         │
│     •Create feature correspondence map                           │
│                                                                   │
│  6. ESTIMATING CAMERA POSES                                      │
│     •Structure from Motion (SfM) algorithm                      │
│     •Calculate position and orientation of each camera          │
│     •Output: R (rotation), T (translation) for each image       │
│                                                                   │
│  7. RECONSTRUCTING GEOMETRY                                      │
│     •Triangulate 3D points from matched features                │
│     •Create sparse point cloud                                   │
│     •Estimate block dimensions from point cloud bounding box    │
│                                                                   │
│  8. ESTIMATING DIMENSIONS                                        │
│     •Fit Oriented Bounding Box (OBB) to point cloud             │
│     •Extract main axes: Length, Breadth, Height                 │
│     •Calculate uncertainty estimates                            │
│     •Output:                                                     │
│        Length: 145.3 cm ± 1.2 cm                                │
│        Breadth: 89.7 cm ± 0.8 cm                                │
│        Height: 62.4 cm ± 0.5 cm                                 │
│                                                                   │
│  9. CALCULATING VOLUME                                           │
│     •Simple bounding box volume = L × B × H                     │
│     •Advanced: Adjust for actual point cloud occupancy          │
│     •Volume = 812,456 cm³ (0.812 m³)                            │
│                                                                   │
│  10. ANALYZING DEFECTS                                           │
│     •YOLOv8 defect detector runs on each image                  │
│     •Detect: Cracks, holes, patches, color variations           │
│     •Output: [{'kind': 'crack', 'severity': 'medium',           │
│                 'surface': 'FRONT', 'confidence': 0.89}]        │
│                                                                   │
│  11. OPTIMIZING CUTTING                                          │
│     •Analyze optimal cutting orientations                       │
│     •Calculate usable yield after trim损失                     │
│     •Output: 3 orientations with yield percentages              │
│                                                                   │
│  12. ESTIMATING WASTAGE                                          │
│     •Calculate waste from geometry vs usable cut                │
│     •Include defect exclusion volume                            │
│     •Output: Waste percentage, irregularity ratio               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Measurement Result Database Record:**
```python
measurement_results = {
    "job_id": "analysis-job-uuid",
    "length_cm": 145.3,
    "breadth_cm": 89.7,
    "height_cm": 62.4,
    "length_uncertainty_cm": 1.2,
    "breadth_uncertainty_cm": 0.8,
    "height_uncertainty_cm": 0.5,
    "measurement_confidence": 0.92,
    "analysis_method": "Multi-View Calibrated Geometry",
    "images_used": 8,
    "calibration_method": "MANUAL_REFERENCE",
    "surfaces_analyzed": ["FRONT", "BACK", "LEFT", "RIGHT", "FRONT_RIGHT", "BACK_RIGHT", "BACK_LEFT", "FRONT_LEFT"],
    "cm_per_pixel": 0.25
}
```

**Geometry Model Record:**
```python
geometry_models = {
    "job_id": "analysis-job-uuid",
    "point_cloud_path": "geometry/job-uuid/sparse_cloud.json",
    "bounding_box_json": {
        "center": [0.0, 0.0, 0.0],
        "extents": [145.3, 89.7, 62.4],
        "rotation": [0.0, 0.0, 0.0]
    },
    "simplified_geometry_json": {
        "vertices": [...],
        "faces": [...]
    },
    "reconstruction_confidence": 0.89,
    "match_count": 1247,
    "notes": "Good coverage, excellent feature matching"
}
```

---

#### **STEP 6: Viewing Analysis Results**

**Access Block Analysis:**
```
1. Navigate to /blocks
2. Find block in register (filtered by status or search)
3. Click block to open /blocks/{id}
4. Multiple tabs with detailed information
```

**Analysis Tabs:**

**A. RECONSTRUCTION TAB**
- Interactive 3D point cloud viewer
- Rotate/zoom/pan 3D model
- See captured views overlaid on 3D model
- Visualize camera positions
- View feature matches

**B. MEASUREMENTS TAB**
```
┌─────────────────────────────────────────────────────────┐
│  DIMENSIONAL ANALYSIS                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Length:    145.3 cm  ± 1.2 cm  (99.2% confidence)     │
│  Breadth:    89.7 cm  ± 0.8 cm  (99.6% confidence)     │
│  Height:     62.4 cm  ± 0.5 cm  (99.2% confidence)     │
│                                                         │
│  Volume:     0.812 m³                                   │
│  Analysis Method: Multi-View Calibrated Geometry       │
│  Images Used: 8                                         │
│  Calibration: Manual Reference (10cm reference,        │
│               150 pixels)                              │
│                                                         │
│  [CALCULATE SEIGNIORAGE]                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**C. DEFECTS TAB**
```
┌─────────────────────────────────────────────────────────┐
│  DEFECT ANALYSIS                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Provider: YOLODefectDetectionProvider                 │
│                                                         │
│  Findings: 3 defects detected                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ finding #1: Crack (Medium Severity)            │   │
│  │ Surface: FRONT                                   │   │
│  │ Confidence: 89%                                 │   │
│  │ BoundingBox: [x:45, y:120, w:320, h:15]        │   │
│  │                                                 │   │
│  │ [VIEW IMAGE WITH BOUNDING BOX]                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ finding #2: Hole (High Severity)               │   │
│  │ Surface: RIGHT                                  │   │
│  │ Confidence: 76%                                 │   │
│  │ BoundingBox: [x:200, y:80, w:45, h:52]         │   │
│  │                                                 │   │
│  │ [VIEW IMAGE WITH BOUNDING BOX]                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Bottom Surface: Not Observed                          │
│  Internal Defects: Not Detected                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**D. CUTTING TAB**
```
┌─────────────────────────────────────────────────────────┐
│  CUTTING OPTIMIZATION                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI Estimated Cutting Optimization                      │
│                                                         │
│  Recommended Orientation: A                            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ORIENTATION A (Recommended)                    │   │
│  │ Length along L, Breadth along B, Height along H│   │
│  │                                                 │   │
│  │ Usable Dimensions:                             │   │
│  │   Length:  141.6 cm (103% of original)        │   │
│  │   Breadth: 86.4 cm (96% of original)          │   │
│  │   Height:  59.5 cm (95% of original)          │   │
│  │                                                 │   │
│  │ Usable Volume: 727,456 cm³ (89.6%)            │   │
│  │ Trimming Waste: 84,000 cm³ (10.4%)            │   │
│  │                                                 │   │
│  │ [3D CUT SIMULATION]                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Alternative Orientations: B, C available              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**E. EVIDENCE TAB**
- Gallery of all captured images
- Filter by side/acceptance status
- View validation results for each image
- Download original images

**F. REPORT TAB**
- Generate PDF report with all analysis data
- Include 3D model images, dimensions, defects
- Export for external review

---

#### **STEP 7: Manual Verification (Department Quality Control)**

**When Verification Is Triggered:**
- High-value blocks (>threshold dimensions)
- Blocks with low measurement confidence
- Random quality audits
- Disputed measurements

**Verification Form:**
```
┌─────────────────────────────────────────────────────────┐
│  MANUAL VERIFICATION                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI-Estimated Dimensions:                              │
│  • Length:    145.3 cm  ± 1.2 cm                      │
│  • Breadth:    89.7 cm  ± 0.8 cm                      │
│  • Height:     62.4 cm  ± 0.5 cm                      │
│                                                         │
│  Enter Verified Dimensions (using field tools):         │
│  • Verified Length:    [146.0] cm                     │
│  • Verified Breadth:   [90.0] cm                      │
│  • Verified Height:    [63.0] cm                      │
│                                                         │
│  Variance Analysis:                                     │
│  • Length variance:    +0.7 cm (+0.48%)               │
│  • Breadth variance:   +0.3 cm (+0.33%)               │
│  • Height variance:    +0.6 cm (+0.96%)               │
│  • Volume variance:    +2.1%                          │
│                                                         │
│  Decision: [✓ VERIFIED] [✗ REJECT] [MODIFY]           │
│                                                         │
│  Remarks:                                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Field verification using tape measure. Block      │ │
│  │ dimension matched AI estimate within tolerance.   │ │
│  │ Recommend approval.                               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  [SUBMIT VERIFICATION]                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Database Record:**
```python
manual_verifications = {
    "job_id": "analysis-job-uuid",
    "block_id": "block-uuid",
    "officer_id": "officer-uuid",
    "verified_length_cm": 146.0,
    "verified_breadth_cm": 90.0,
    "verified_height_cm": 63.0,
    "dimension_variance_json": {
        "length_cm": 0.7,
        "breadth_cm": 0.3,
        "height_cm": 0.6
    },
    "volume_variance_json": {
        "absolute_cm3": 17456,
        "percentage": 2.1
    },
    "decision": "VERIFIED",
    "remarks": "Field verification matched AI estimate"
}
```

---

#### **STEP 8: Seigniorage Assessment (Revenue Calculation)**

**Seigniorage Formula:**
```
Seigniorage = Volume (m³) × Rate (per m³) × Density Factor

Where:
- Volume comes from measurement results
- Rate depends on: granite category, gangsaw class, seigniorage rates table
- Density: typically 2.65 t/m³ for granite
```

**Auto-Calculation:**
```
1. Get granite category from block record
2. Look up rate from seigniorage_rates table:
   - Match: category_id, gangsaw_class (based on dimensions)
   - Example: "Red Galaxy", "GANGSAW_CLASS_2" → ₹4,500/m³
   
3. Calculate volume:
   - From measurement_results: 0.812 m³
   - Or: L × B × H / 1,000,000
   
4. Calculate seigniorage:
   - 0.812 m³ × ₹4,500/m³ = ₹3,654
   - Times density factor (if applicable)
   
5. Store in seigniorage_assessments table:
   {
     "job_id": "analysis-job-uuid",
     "block_id": "block-uuid",
     "category_id": "category-uuid",
     "rate_id": "rate-uuid",
     "gangsaw_class": "GANGSAW_CLASS_2",
     "assessment_kind": "INDICATIVE_AI_ASSESSMENT",
     "volume_cm3": 812456,
     "volume_m3": 0.812,
     "rate_per_m3": 4500.0,
     "indicative_amount": 3654.0,
     "currency": "INR",
     "density_used_t_m3": 2.65,
     "estimated_tonnes": 2.15,
     "notes": "AI-derived volume, indicative assessment"
   }
```

---

### 3.2 Department-Specific Features

#### **Feature: Block Register (Main Dashboard)**

**Purpose:** Central repository of all granite blocks with full audit trail

**Key Capabilities:**
```
1. SEARCH & FILTER
   • Search by block_code, quarry, status
   • Filter by: ALL, ANALYZED, PROCESSING, FAILED
   • Sort by: Newest, Oldest, Code (A-Z), Code (Z-A)
   
2. STATUS VISUALIZATION
   • Registered: Block created
   • Capture In Progress: Images being captured
   • Ready for Analysis: Waiting for AI processing
   • Analyzing: AI currently processing
   • Analyzed: Measurements complete
   • Verified: Manual verification completed
   • Analysis Failed: Rejected by AI, needs retry
   
3. ADMIN OPERATIONS
   • Select multiple blocks for bulk operations
   • Delete blocks (with confirmation)
   • View audit log for each block
```

#### **Feature: Quarry Network Management**

**Quarry Entities:**
```
• quarry_name: "Nandyal Granite Quarries"
• quarry_code: "QN-2024-001"
• lease_id: "LS-2023-4567"
• district: "Nandyal"
• mandal: "Nandyal"
• village: "Polavaram"
• granite_category_id: Foreign key to categories
•latitude, longitude: GPS coordinates
• boundary_geojson: GeoJSON polygon of quarry area
```

#### **Feature: Multiple Operator Access**

**Role-Based Access:**
```
Admin:
• Register quarries and granite categories
• Create blocks for any operator
• View all blocks in system
• Delete blocks
• Access audit logs

Operator:
• Create blocks (under their user ID)
• Capture images for their blocks
• View their blocks only
• Submit blocks for analysis
```

---

## 4. Technical Deep Dive: Block Measurement Accuracy

### 4.1 Measurement Uncertainty Sources

**1. Calibration Accuracy:**
```
• Manual Reference Error: ±1-2 pixels in reference measurement
• Aruco Marker Error: ±0.5-1% of marker size
• Board Calibration Error: ±0.3-0.8%

Combined calibration uncertainty: ~1-2% of measurement
```

**2.Photogrammetry Error:**
```
• Feature matching error: ±0.5-1 pixels
• Camera pose estimation error: ~1-3%
• Point cloud triangulation error: depends on view geometry

Combined photogrammetry uncertainty: ~2-3%
```

**3. User Capture Error:**
```
• Incomplete coverage (missing sides): Up to 10%
• Poor angle (too flat): 5-15%
• Occlusion (people/objects): 3-8%

Best practice: 8-10 well-distributed views reduces this to <2%
```

**4. Total Expected Uncertainty:**
```
• Well-executed capture: ±1-2 cm (1-2%)
• Average capture: ±2-3 cm (2-3%)
• Poor capture: ±5+ cm (5%+)
```

### 4.2 Confidence Scores Explained

**Measurement Confidence:** 0.85-0.99 range

**Calculation Factors:**
```
1. Number of accepted images (more = higher confidence)
2. View distribution (360° = higher than partial)
3. Calibration quality (clear reference = higher)
4. Feature match count (more matches = higher)
5. Reconstruction consistency (low reprojection error = higher)
```

**Interpretation:**
```
0.95-0.99: Excellent - multiple high-quality views, great calibration
0.85-0.95: Good - adequate coverage, good calibration
0.70-0.85: Acceptable - some limitations, flag for review
< 0.70: Poor - review recommended, may need recapture
```

---

## 5. Performance Benchmark

### 5.1 Processing Speed

**On Device (Mobile):**
```
• Image upload: 2-5 seconds (4G/LTE)
• Image validation: <1 second (on-device detection available)
• Full analysis (backend): 30-90 seconds
```

**On Backend Server (typical):**
```
• 5-6 images: 30-45 seconds
• 8-10 images: 45-70 seconds
• 10+ images: 60-90 seconds

Note: Processing time increases with image count but
diminishes returns after ~12 images due to saturation.
```

### 5.2 Accuracy Benchmarks (Expected)

**Dimensional Accuracy:**
```
• Length: ±1.0-1.5 cm (0.7-1.5%)
• Breadth: ±0.8-1.2 cm (1.0-1.8%)
• Height: ±0.5-1.0 cm (0.8-1.6%)

Volume Accuracy: ±2-3% (typical)
```

**Calibration-Free Accuracy:**
```
Without proper calibration, measurements are relative only.
Absolute accuracy requires reference object in scene.
```

---

## 6. Best Practices for Department Users

### 6.1 Best Practices for Accurate Measurement

**PRE-CAPTURE:**
```
✓ Inspect block before capture - identify best viewing angles
✓ Clear obstacles from around block (people, tools, vehicles)
✓ Check lighting - avoid direct sun glare or deep shadows
✓ Enable GPS on device (for field audit trail)
✓ Prepare reference object if using manual calibration
```

**DURING CAPTURE:**
```
✓ Capture all 10 standard views (don't skip "easy" sides)
✓ Keep camera steady - use both hands or tripod
✓ Fill frame with block - minimal empty space
✓ Maintain good overlap between adjacent views (30-50%)
✓ Capture at consistent distance (1-2 meters typical)
✓ Use 4K/1080p resolution (not compressed thumbnails)
```

**POST-CAPTURE:**
```
✓ Review validation results - retake rejected images
✓ Ensure minimum 5 accepted images (aim for 8-10)
✓ Check 360° coverage - no large gaps
✓ Submit for analysis only when all validation green
✓ Record field notes for unusual block features
```

### 6.2 Common Pitfalls to Avoid

**Pitfall 1: Insufficient Views**
```
Problem: User captures only 2-3 "obvious" sides
Impact: AI cannot reconstruct 3D geometry properly
Solution: Capture all 10 standard views, even if some
          appear redundant
```

**Pitfall 2: Poor Lighting**
```
Problem: Strong shadows or blown-out highlights
Impact: AI cannot detect granite edges accurately
Solution: Capture during morning/evening (softer light),
          avoid mid-day sun
```

**Pitfall 3: Wrong Calibration**
```
Problem: Using Aruco method without actual marker
Impact: Calibration fails, measurement impossible
Solution: Match calibration type to actual conditions:
          - No marker? Use MANUAL_REFERENCE
          - Have marker? Use ARUCO
```

**Pitfall 4: Occlusion**
```
Problem: People, vehicles, or equipment in frame
Impact: AI may detect non-granite objects, fail validation
Solution: Clear scene before capture, especially in frame
          edges where block meets background
```

**Pitfall 5: Moving Block**
```
Problem: Block moves between images (e.g., being lifted)
Impact: Feature matching fails, reconstruction impossible
Solution: Capture block in stable position, no movement
          during photo sequence
```

---

## 7. Audit Trail & Compliance

### 7.1 Complete Audit Log

**Every Action Logged:**
```sql
INSERT INTO audit_logs (
  entity_type, entity_id, action, actor_id, timestamp, metadata_json
) VALUES (
  'granite_block', 'block-uuid', 'block_created',
  'operator-uuid', NOW(), '{"block_code': 'GR-2024-001'}'
);

-- Also logged:
-- • image_captured (with side)
-- • image_validated (accepted/rejected with reasons)
-- • capture_session_created
-- • capture_session_complete
-- • analysis_started
-- • analysis_completed / analysis_failed
-- • manual_verification_submitted
-- • seigniorage_assessed
```

**Access Audit Log:**
```
Frontend: AuditPanel component
Backend: /api/v1/audit-logs?entity_type=granite_block&entity_id=uuid
```

### 7.2 Compliance Features

**For Government Audits:**
```
✓ Immutable block registration (can't alter block_code)
✓ GPS timestamp for eachcapture
✓ Operator ID tracking for accountability
✓ Image versioning (original files stored)
✓ Analysis job history (all state transitions)
✓ Manual verification records
✓ Seigniorage calculation audit trail
```

**Data Retention:**
```
• Original images: 7 years (configurable)
• Measurements: Permanent
• Audit logs: Permanent
• Temporary files (intermediate): 30 days
```

---

## 8. Troubleshooting Guide

### 8.1 "Analysis Failed" - Common Causes

**Error: "Fewer than 5 accepted images"**
```
Cause: User skipped too many images or all failed validation
Solution: Retake images, ensure each passes validation
```

**Error: "Granite detection model is not configured"**
```
Cause: AI models not uploaded to backend
Solution: Upload granite detection model (YOLOv8)
          to /models/hub/ directory
```

**Error: "Measurement calibration required"**
```
Cause: No valid calibration found in any image
Solution: 
  - For Manual Reference: User must enter reference pixels
  - For Aruco: Marker must be visible in at least 1 image
  - For Board: Board must be visible in at least 1 image
```

**Error: "Geometry reconstruction failed"**
```
Cause: Insufficient feature matches across images
Solution:
  - Capture more images (aim for 8-10)
  - Ensure adequate texture on block surface
  - Avoid featureless surfaces (polished granite)
  - Ensure good overlap between images
```

### 8.2 "Validation Failed" - Common Issues

**Issue: "Duplicate image detected"**
```
Cause: Same file uploaded twice, or identical scene
Solution: Use different image, or resize/rotate slightly
```

**Issue: "Not a Granite Block"**
```
Cause: AI detector doesn't see granite
Solution:
  - Ensure granite is clearly visible
  - Fill frame with block
  - Avoid background confusion (sky vs granite)
```

**Issue: "Blur detected"**
```
Cause: Camera movement during capture
Solution: Use both hands, steady camera, shorter shutter
```

**Issue: "Weak feature overlap"**
```
Cause: Image too different from existing ones
Solution: Maintain 30-50% overlap with adjacent views
```

---

## 9. Configuration & Customization

### 9.1 Calibration Configuration

**Backend Settings (app/core/config.py):**
```python
class Settings(BaseSettings):
    # Detection thresholds
    granite_detection_confidence: float = 0.6
    validation_quality_threshold: float = 0.5
    
    # Capture requirements
    minimum_evidence_images: int = 5
    minimum_side_coverage: float = 0.8
    
    # Measurement tolerances
    maximum_dimension_variance_pct: float = 5.0
    minimum_measurement_confidence: float = 0.7
    
    # Calibration methods
    allowed_calibration_types: List[str] = [
        "MANUAL_REFERENCE",
        "ARUCO",
        "MEASUREMENT_BOARD"
    ]
```

### 9.2 Seigniorage Rates Configuration

**Database Table:**
```sql
INSERT INTO seigniorage_rates (
  version_id, category_id, gangsaw_class, rate_per_cubic_metre,
  above_length_cm, above_breadth_cm
) VALUES (
  'version-uuid', 'category-uuid', 'GANGSAW_CLASS_1', 5500.0,
  270.0, 150.0
);

-- Classifications:
-- GANGSAW_CLASS_1: Large blocks (>270cm length, >150cm breadth)
-- GANGSAW_CLASS_2: Medium blocks
-- GANGSAW_CLASS_3: Small blocks
```

---

## 10. Conclusion

### 10.1 Summary: Why This Matters for Departments

**Before GraniteMeasure AI:**
```
✗ Manual measurements (tape measure, error-prone)
✗ Subjective disputes over dimensions
✗ No digital audit trail
✗ Revenue leakage through under-reporting
✗ Cutting decisions based on guesswork
✗ No block-level analytics
```

**After GraniteMeasure AI:**
```
✓ Digital twin creation (immutable evidence)
✓ Centimeter-level accuracy (1-2% typical)
✓ Complete audit trail (all actions logged)
✓ Automated seigniorage calculation
✓ Cutting optimization (maximize yield)
✓ Block-level analytics & reporting
```

### 10.2 Key Metrics for Success

**Department KPIs:**
```
1. Measurement Accuracy: ±2% (achievable with proper capture)
2. Processing Time: <2 minutes per block (end-to-end)
3. First-Time Pass Rate: >85% (with training)
4. Seigniorage Recovery: 100% (no unmeasured blocks)
5. Dispute Resolution: <24 hours (digital evidence available)
```

### 10.3 Next Steps

**Immediate (Week 1):**
```
1. Training: Conduct user training on capture best practices
2. Pilot: Run pilot with 10-20 real blocks
3. Calibration: Set up seigniorage rates in database
4. Review: Establish manual verification workflow
```

**Short-term (Month 1):**
```
1. Optimization: Adjust AI thresholds based on pilot feedback
2. Expansion: Roll out to all quarries
3. Integration: Connect to existing revenue systems
4. Analytics: Start monitoring block metrics
```

**Long-term (Quarter 1):**
```
1. Advanced: Implement real-time field validation
2. Mobile App: Full native app deployment
3. Reporting: Automated monthly reports
4. Blockchain: Integrate with land records blockchain
```

---

## Appendix

### A. API Reference (Block Measurement Endpoints)

**Block Management:**
```
POST   /api/v1/granite-blocks           Create block
GET    /api/v1/granite-blocks           List blocks
GET    /api/v1/granite-blocks/{id}      Get block details
DELETE /api/v1/granite-blocks/{id}      Delete block
```

**Capture Sessions:**
```
POST   /api/v1/capture-sessions                 Create session
GET    /api/v1/capture-sessions/{id}            Get session
POST   /api/v1/capture-sessions/{id}/complete   Complete session
```

**Image Management:**
```
POST   /api/v1/capture-sessions/{id}/images     Upload image
GET    /api/v1/capture-sessions/{id}/images     List images
POST   /api/v1/images/{id}/validate             Validate image
```

**Analysis:**
```
POST   /api/v1/analysis-jobs                      Submit for analysis
GET    /api/v1/analysis-jobs/{id}                 Get analysis job
GET    /api/v1/blocks/{id}/analysis               Get block analysis
```

### B. Database Schema (Block Measurement Tables)

```sql
-- Main tables for block measurement workflow:
granite_blocks            -- Block registration
capture_sessions          -- Image capture sessions
block_images             -- Individual images
image_validation_results -- Validation status
analysis_jobs            -- AI analysis jobs
measurement_results      -- Dimensional output
geometry_models          -- 3D point cloud
defect_results           -- Defect detection
cutting_optimization_results -- Cutting suggestions
wastage_results          -- Waste estimation
seigniorage_assessments  -- Revenue calculation
manual_verifications     -- Quality control
audit_logs               -- Complete audit trail
```

### C. Configuration Files

**Frontend (frontend/ .env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME="GraniteMeasure AI"
NEXT_PUBLIC_DEFAULT_QUARRY_ID=quarry-uuid
```

**Backend (.env):**
```
DATABASE_URL=postgresql+psycopg://granite:granite@localhost:5432/granitemeasure
REDIS_URL=redis://localhost:6379/0
DEMO_MODE=false
SEED_DEMO_USERS=true
```

### D. Support & Troubleshooting

**Logs:**
```
Frontend: Browser console (F12)
Backend: Terminal output (uvicorn logs)
Database: PostgreSQL logs
```

**Debug Mode:**
```
Backend: Set DEBUG=true in .env
Frontend: Developer mode in Next.js
```

**Support Contact:**
```
Technical Team: [admin email]
Department Helpdesk: [phone number]
```

---

**Document Version:** 1.0  
**Last Updated:** October 2024  
**Prepared For:** Granite Department Administration  
**System Version:** GraniteMeasure AI v2.4.0
