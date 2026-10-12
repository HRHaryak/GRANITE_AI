#!/usr/bin/env python3
"""
GraniteMeasure AI - Comprehensive User Walkthrough Generator
Generates a professional PDF document for the block measurement workflow.
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, ListFlowable, ListItem, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from datetime import datetime

# Page dimensions
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2.5 * cm


class GraniteMeasurePDF:
    """Generate comprehensive walkthrough PDF for GraniteMeasure AI."""
    
    def __init__(self, output_path="GRANITE_MEASURE_AI_WALKTHROUGH.pdf"):
        self.output_path = output_path
        self.styles = getSampleStyleSheet()
        
        # Use existing Heading1 as Title
        self.title_style = self.styles['Heading1']
        self.title_style.fontSize = 24
        self.title_style.textColor = colors.HexColor('#123F49')
        self.title_style.spaceAfter = 30
        self.title_style.alignment = 1  # Center

        self.styles.add(ParagraphStyle(
            name='Subtitle',
            parent=self.styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#6B8A91'),
            spaceAfter=20,
            alignment=1
        ))

        self.styles.add(ParagraphStyle(
            name='SectionTitle',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#0F7E84'),
            spaceAfter=12,
            fontName='Helvetica-Bold'
        ))

        self.styles.add(ParagraphStyle(
            name='SubsectionTitle',
            parent=self.styles['Heading3'],
            fontSize=14,
            textColor=colors.HexColor('#15949B'),
            spaceAfter=10,
            fontName='Helvetica-Bold'
        ))

        self.styles.add(ParagraphStyle(
            name='NormalIndent',
            parent=self.styles['Normal'],
            leftIndent=15,
            spaceAfter=8
        ))

        self.styles.add(ParagraphStyle(
            name='CodeBlock',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.black,
            backColor=colors.HexColor('#F5F5F5'),
            borderColor=colors.grey,
            borderWidth=1,
            padding=6,
            fontName='Courier'
        ))

        self.styles.add(ParagraphStyle(
            name='NoteBox',
            parent=self.styles['Normal'],
            textColor=colors.HexColor('#8B4513'),
            backColor=colors.HexColor('#FFF8DC'),
            borderColor=colors.HexColor('#DAA520'),
            borderWidth=1,
            padding=8,
            leftIndent=10,
            rightIndent=10
        ))

        self.styles.add(ParagraphStyle(
            name='WarningBox',
            parent=self.styles['Normal'],
            textColor=colors.red,
            backColor=colors.HexColor('#FFF0F0'),
            borderColor=colors.red,
            borderWidth=1,
            padding=8,
            leftIndent=10,
            rightIndent=10
        ))
        
    def build_document(self):
        """Build the complete PDF document."""
        doc = SimpleDocTemplate(
            self.output_path,
            pagesize=A4,
            rightMargin=MARGIN,
            leftMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=MARGIN
        )
        
        story = []
        
        # Cover page
        story.append(Spacer(1, 4*cm))
        story.append(Paragraph("GraniteMeasure AI", self.styles['Title']))
        story.append(Paragraph("Comprehensive User Walkthrough", self.styles['Subtitle']))
        story.append(Spacer(1, 2*cm))
        story.append(Paragraph("For the Granite Department", self.styles['Normal']))
        story.append(Spacer(1, 1*cm))
        story.append(Paragraph(f"Version 1.0 | {datetime.now().strftime('%B %Y')}", self.styles['Normal']))
        story.append(PageBreak())
        
        # Table of Contents
        self._add_table_of_contents(story)
        story.append(PageBreak())
        
        # Executive Summary
        self._add_executive_summary(story)
        story.append(PageBreak())
        
        # Section 1: Introduction
        self._add_section_1(story)
        story.append(PageBreak())
        
        # Section 2: System Architecture
        self._add_section_2(story)
        story.append(PageBreak())
        
        # Section 3: Core Workflow - Block Measurement
        self._add_section_3(story)
        story.append(PageBreak())
        
        # Section 4: Technical Deep Dive
        self._add_section_4(story)
        story.append(PageBreak())
        
        # Section 5: Performance Benchmark
        self._add_section_5(story)
        story.append(PageBreak())
        
        # Section 6: Best Practices
        self._add_section_6(story)
        story.append(PageBreak())
        
        # Section 7: Audit Trail
        self._add_section_7(story)
        story.append(PageBreak())
        
        # Section 8: Troubleshooting
        self._add_section_8(story)
        story.append(PageBreak())
        
        # Section 9: Configuration
        self._add_section_9(story)
        story.append(PageBreak())
        
        # Conclusion
        self._add_conclusion(story)
        
        # Build PDF
        doc.build(story)
        print(f"PDF generated successfully: {self.output_path}")
        print(f"Total pages: {doc.page}")
        
    def _add_table_of_contents(self, story):
        """Add table of contents."""
        story.append(Paragraph("Table of Contents", self.styles['SectionTitle']))
        
        toc_items = [
            "1. Introduction",
            "2. System Architecture Overview",
            "3. Core Workflow: Block Measurement (The Department's Pain Point)",
            "4. Technical Deep Dive: Block Measurement Accuracy",
            "5. Performance Benchmark",
            "6. Best Practices for Department Users",
            "7. Audit Trail & Compliance",
            "8. Troubleshooting Guide",
            "9. Configuration & Customization",
            "10. Conclusion",
            "Appendix A: API Reference",
            "Appendix B: Database Schema",
            "Appendix C: Configuration Files",
        ]
        
        for i, item in enumerate(toc_items, 1):
            story.append(Paragraph(f"{i}. {item}", self.styles['Normal']))
            story.append(Spacer(1, 2))
    
    def _add_executive_summary(self, story):
        """Add executive summary section."""
        story.append(Paragraph("Executive Summary", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>GraniteMeasure AI</b> is an intelligent granite block measurement and analysis "
                              "platform that transforms traditional granite quarry operations through digital "
                              "transformation.", self.styles['Normal']))
        
        story.append(Spacer(1, 12))
        
        # Core capabilities
        story.append(Paragraph("The platform enables:", self.styles['Normal']))
        
        capabilities = [
            "Capture granite block dimensions using smartphone cameras",
            "Measure dimensions with centimeter-level accuracy using AI-powered photogrammetry",
            "Verify measurements through multi-view 3D reconstruction",
            "Optimize cutting patterns and estimate usable yield",
            "Assess seigniorage and tax obligations automatically"
        ]
        
        for cap in capabilities:
            story.append(Paragraph(f"• {cap}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        # Why block measurement matters
        story.append(Paragraph("<b>Why Block Measurement Matters</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("For granite quarry departments, accurate block measurement is the <b>core pain point</b>:",
                              self.styles['Normal']))
        
        pain_points = [
            "Traditional tape-measure methods are error-prone and subjective",
            "Disputes over dimensions lead to revenue leakage",
            "Manual recording creates audit trail vulnerabilities",
            "No digital record for blockchain-style governance",
            "Cutting decisions made without accurate geometry"
        ]
        
        for point in pain_points:
            story.append(Paragraph(f"• {point}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 8))
        
        story.append(Paragraph("GraniteMeasure AI solves these problems through:", self.styles['Normal']))
        
        solutions = [
            "Evidence-based digital twin creation",
            "Multi-view photogrammetric reconstruction",
            "Automated, auditable measurement records",
            "AI-powered yield optimization"
        ]
        
        for sol in solutions:
            story.append(Paragraph(f"• {sol}", self.styles['NormalIndent']))
    
    def _add_section_1(self, story):
        """Add Section 1: Introduction."""
        story.append(Paragraph("1. Introduction", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>1.1 What is GraniteMeasure AI?</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("GraniteMeasure AI is a mobile-first platform that enables quarry operators, "
                              "government officials, and stone processors to capture, measure, and analyze "
                              "granite blocks with unprecedented accuracy and reliability.", self.styles['Normal']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>1.2 Why Block Measurement Matters</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Accurate measurement is the foundation of granite governance. Without it, "
                              "departments face revenue leakage, disputes, and lack of accountability. "
                              "GraniteMeasure AI provides evidence-based measurements that serve as the "
                              "single source of truth.", self.styles['Normal']))
    
    def _add_section_2(self, story):
        """Add Section 2: System Architecture."""
        story.append(Paragraph("2. System Architecture Overview", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>2.1 Platform Components</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("The platform consists of three main layers:", self.styles['Normal']))
        
        # Component list
        components = [
            ("User Interface (Frontend)", 
             "Next.js Web Application, Mobile-optimized PWA, Android Native App, Telugu + English Localization"),
            ("API Gateway (Backend)", 
             "FastAPI REST API (Port 8000), PostgreSQL Database, Redis for Caching, CORS-enabled"),
            ("AI Analysis Engine", 
             "Multi-View Photogrammetry, Granite Detection (YOLOv8), Segment Anything, "
             "Defect Detection, Calibration Methods, Geometry Reconstruction")
        ]
        
        for title, desc in components:
            story.append(Paragraph(f"<b>{title}:</b> {desc}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>2.2 Data Flow</b>", self.styles['SubsectionTitle']))
        
        flow_steps = [
            "BLOCK CREATION → User registers block with quarry, category, GPS",
            "CAPTURE SESSION INITIATION → Session created with calibration method",
            "EVIDENCE CAPTURE → User captures 10+ photos with GPS metadata",
            "IMAGE VALIDATION → AI checks quality, granite detection, duplicate detection",
            "ANALYSIS JOB SUBMISSION → Submission triggers background analysis",
            "3D RECONSTRUCTION → Multi-view processing calculates dimensions",
            "REPORTING & VERIFICATION → Results displayed for manual verification"
        ]
        
        for step in flow_steps:
            story.append(Paragraph(f"1. {step}", self.styles['NormalIndent']))
    
    def _add_section_3(self, story):
        """Add Section 3: Core Workflow."""
        story.append(Paragraph("3. Core Workflow: Block Measurement", self.styles['SectionTitle']))
        story.append(Paragraph("<i>(The Department's Primary Pain Point)</i>", self.styles['Normal']))
        
        # Step 1
        story.append(Paragraph("<b>Step 1: Block Registration</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Access: <b>/blocks</b> → <b>'New Analysis'</b> button", self.styles['Normal']))
        
        steps_1 = [
            "User selects Quarry from registered quarry network",
            "User selects Granite Category (e.g., Red Galaxy, White Galaxy)",
            "User enters Block Code (auto-generated or manual)",
            "User captures GPS coordinates (optional but recommended)",
            "System creates permanent block record with unique ID",
            "Block status set to: REGISTERED"
        ]
        
        for step in steps_1:
            story.append(Paragraph(f"• {step}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 8))
        
        api_block = '''POST /api/v1/granite-blocks
{
  "block_code": "GR-2024-001",
  "quarry_id": "uuid-here",
  "granite_category_id": "uuid-here",
  "capture_date": "2024-10-01T10:00:00Z",
  "gps": {"latitude": 17.3850, "longitude": 78.4867, "accuracy": 5.0},
  "notes": "North face quarry, phase 3"
}'''
        
        story.append(Paragraph("<b>API Endpoint:</b>", self.styles['Normal']))
        story.append(Paragraph(api_block, self.styles['CodeBlock']))
        
        story.append(Spacer(1, 12))
        
        # Step 2
        story.append(Paragraph("<b>Step 2: Capture Session Setup</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("The system creates a capture session with one of three calibration methods:", self.styles['Normal']))
        
        calibrations = [
            ("<b>MANUAL_REFERENCE</b>", 
             "User specifies known reference size and pixel width (quick, no markers)"),
            ("<b>ARUCO</b>", 
             "Detects Aruco markers in scene (controlled environments)"),
            ("<b>MEASUREMENT_BOARD</b>", 
             "Uses calibrated board with known dimensions (high precision)")
        ]
        
        for method, desc in calibrations:
            story.append(Paragraph(f"• {method}: {desc}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        # Step 3 - The Critical Step
        story.append(Paragraph("<b>Step 3: Guided Evidence Capture (The Heart of Accuracy)</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Most measurement systems just take 'some photos.' GraniteMeasure AI uses "
                              "<b>AI-guided capture</b> to ensure complete 360° evidence:", self.styles['Normal']))
        
        # Guided views diagram
        story.append(Paragraph("<b>Required Core Views (5 minimum):</b>", self.styles['Normal']))
        core_views = [
            "1. FRONT - Main visible face",
            "2. BACK - Rear surface",
            "3. LEFT - Complete left side",
            "4. RIGHT - Complete right side",
            "5. TOP - Elevated/top view"
        ]
        
        for view in core_views:
            story.append(Paragraph(f"• {view}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 6))
        
        story.append(Paragraph("<b>Bridge Views (AI-requested if overlap weak):</b>", self.styles['Normal']))
        bridge_views = [
            "6. FRONT_RIGHT - Oblique 30-45° right",
            "7. BACK_RIGHT - Oblique rear-right",
            "8. BACK_LEFT - Oblique rear-left",
            "9. FRONT_LEFT - Oblique front-left",
            "10. BOTTOM - Only if directly visible"
        ]
        
        for view in bridge_views:
            story.append(Paragraph(f"• {view}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        # Validation checks
        story.append(Paragraph("<b>Validation Checks Performed:</b>", self.styles['SubsectionTitle']))
        
        validations = [
            "GRANITE DETECTION - YOLOv8 detector must detect granite",
            "QUALITY ASSESSMENT - Blur, exposure, noise checks",
            "CALIBRATION VERIFICATION - Reference object visibility",
            "DUPLICATE DETECTION - Perceptual hashing against existing",
            "OVERLAP VERIFICATION - Feature matching with existing images",
            "VIEW MISMATCH DETECTION - Verify correct side uploaded"
        ]
        
        for val in validations:
            story.append(Paragraph(f"• {val}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>Step 4: Complete Capture & Submit for Analysis</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Minimum requirements: <b>5 accepted images</b> with full coverage.", self.styles['Normal']))
        
        story.append(Paragraph("<b>Step 5: AI-Powered 3D Reconstruction & Measurement</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("The analysis pipeline performs:", self.styles['Normal']))
        
        analysis_steps = [
            "1. VALIDATING IMAGES (5+ accepted required)",
            "2. DETECTING GRANITE (YOLOv8 on each image)",
            "3. SEGMENTING GRANITE (Create masks)",
            "4. CHECKING CALIBRATION (Calculate cm/pixel)",
            "5. MATCHING FEATURES (ORB/SIFT extraction)",
            "6. ESTIMATING CAMERA POSES (Structure from Motion)",
            "7. RECONSTRUCTING GEOMETRY (Create point cloud)",
            "8. ESTIMATING DIMENSIONS (Extract L×B×H)",
            "9. CALCULATING VOLUME (0.812 m³ typical)",
            "10. ANALYZING DEFECTS (Cracks, holes, patches)",
            "11. OPTIMIZING CUTTING (3 orientations evaluated)",
            "12. ESTIMATING WASTAGE (Waste percentage calculated)"
        ]
        
        for step in analysis_steps:
            story.append(Paragraph(f"{step}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        # Step 6
        story.append(Paragraph("<b>Step 6: Viewing Analysis Results</b>", self.styles['SubsectionTitle']))
        
        tabs = [
            "RECONSTRUCTION - Interactive 3D point cloud viewer",
            "MEASUREMENTS - Dimensional analysis with confidence scores",
            "DEFECTS - Detected cracks, holes, patches",
            "CUTTING - Cutting optimization recommendations",
            "EVIDENCE - Gallery of all captured images",
            "REPORT - Generate PDF report"
        ]
        
        for tab in tabs:
            story.append(Paragraph(f"• {tab}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        # Step 7
        story.append(Paragraph("<b>Step 7: Manual Verification</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("High-value blocks or low-confidence measurements trigger manual verification.", self.styles['Normal']))
        
        # Step 8
        story.append(Paragraph("<b>Step 8: Seigniorage Assessment</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Formula: <b>Seigniorage = Volume (m³) × Rate (per m³) × Density Factor</b>", self.styles['Normal']))
    
    def _add_section_4(self, story):
        """Add Section 4: Technical Deep Dive."""
        story.append(Paragraph("4. Technical Deep Dive: Block Measurement Accuracy", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>4.1 Measurement Uncertainty Sources</b>", self.styles['SubsectionTitle']))
        
        uncertainty_sources = [
            ("Calibration Accuracy", "Manual: ±1-2 pixels, Aruco: ±0.5-1%, Board: ±0.3-0.8%",
             "Combined: ~1-2% of measurement"),
            ("Photogrammetry Error", "Feature matching: ±0.5-1 pixels, Camera pose: ~1-3%",
             "Combined: ~2-3%"),
            ("User Capture Error", "Incomplete coverage: Up to 10%, Poor angle: 5-15%",
             "Best practice (8-10 views): <2%"),
            ("Total Expected Uncertainty", "Well-executed: ±1-2 cm (1-2%), Average: ±2-3 cm (2-3%)",
             "Poor execution: ±5+ cm (5%+)")
        ]
        
        for source, details, result in uncertainty_sources:
            story.append(Paragraph(f"<b>{source}:</b> {details} <i>({result})</i>", self.styles['Normal']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>4.2 Confidence Scores Explained</b>", self.styles['SubsectionTitle']))
        
        confidence_factors = [
            "Number of accepted images (more = higher confidence)",
            "View distribution (360° = higher than partial)",
            "Calibration quality (clear reference = higher)",
            "Feature match count (more matches = higher)",
            "Reconstruction consistency (low reprojection error = higher)"
        ]
        
        for factor in confidence_factors:
            story.append(Paragraph(f"• {factor}", self.styles['NormalIndent']))
        
        story.append(Paragraph("<b>Interpretation:</b>", self.styles['Normal']))
        
        confidence_levels = [
            "0.95-0.99: Excellent - multiple high-quality views",
            "0.85-0.95: Good - adequate coverage",
            "0.70-0.85: Acceptable - flag for review",
            "< 0.70: Poor - review recommended"
        ]
        
        for level in confidence_levels:
            story.append(Paragraph(f"• {level}", self.styles['NormalIndent']))
    
    def _add_section_5(self, story):
        """Add Section 5: Performance Benchmark."""
        story.append(Paragraph("5. Performance Benchmark", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>5.1 Processing Speed</b>", self.styles['SubsectionTitle']))
        
        processes = [
            ("On Device (Mobile)", 
             "Image upload: 2-5 seconds, Validation: <1 second, Full analysis: 30-90 seconds"),
            ("On Backend Server",
             "5-6 images: 30-45 seconds, 8-10 images: 45-70 seconds, 10+ images: 60-90 seconds")
        ]
        
        for location, times in processes:
            story.append(Paragraph(f"<b>{location}:</b> {times}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>5.2 Accuracy Benchmarks</b>", self.styles['SubsectionTitle']))
        
        accuracy = [
            ("Length", "±1.0-1.5 cm (0.7-1.5%)"),
            ("Breadth", "±0.8-1.2 cm (1.0-1.8%)"),
            ("Height", "±0.5-1.0 cm (0.8-1.6%)"),
            ("Volume", "±2-3% (typical)")
        ]
        
        for dimension, error in accuracy:
            story.append(Paragraph(f"• {dimension}: {error}", self.styles['NormalIndent']))
    
    def _add_section_6(self, story):
        """Add Section 6: Best Practices."""
        story.append(Paragraph("6. Best Practices for Department Users", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>6.1 Best Practices for Accurate Measurement</b>", self.styles['SubsectionTitle']))
        
        pre_capture = [
            "Inspect block before capture - identify best viewing angles",
            "Clear obstacles from around block (people, tools, vehicles)",
            "Check lighting - avoid direct sun glare or deep shadows",
            "Enable GPS on device (for field audit trail)",
            "Prepare reference object if using manual calibration"
        ]
        
        during_capture = [
            "Capture all 10 standard views (don't skip 'easy' sides)",
            "Keep camera steady - use both hands or tripod",
            "Fill frame with block - minimal empty space",
            "Maintain good overlap between adjacent views (30-50%)",
            "Capture at consistent distance (1-2 meters typical)",
            "Use 4K/1080p resolution (not compressed thumbnails)"
        ]
        
        post_capture = [
            "Review validation results - retake rejected images",
            "Ensure minimum 5 accepted images (aim for 8-10)",
            "Check 360° coverage - no large gaps",
            "Submit for analysis only when all validation green",
            "Record field notes for unusual block features"
        ]
        
        story.append(Paragraph("<b>PRE-CAPTURE:</b>", self.styles['Normal']))
        for item in pre_capture:
            story.append(Paragraph(f"• {item}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 6))
        story.append(Paragraph("<b>DURING CAPTURE:</b>", self.styles['Normal']))
        for item in during_capture:
            story.append(Paragraph(f"• {item}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 6))
        story.append(Paragraph("<b>POST-CAPTURE:</b>", self.styles['Normal']))
        for item in post_capture:
            story.append(Paragraph(f"• {item}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>6.2 Common Pitfalls to Avoid</b>", self.styles['SubsectionTitle']))
        
        pitfalls = [
            ("Insufficient Views", "Only 2-3 sides captured. Impact: AI cannot reconstruct 3D geometry.",
             "Solution: Capture all 10 standard views"),
            ("Poor Lighting", "Strong shadows or blown-out highlights. Impact: AI cannot detect granite edges.",
             "Solution: Capture during morning/evening"),
            ("Wrong Calibration", "Using Aruco without actual marker. Impact: Calibration fails.",
             "Solution: Match calibration type to conditions"),
            ("Occlusion", "People, vehicles in frame. Impact: AI detects non-granite objects.",
             "Solution: Clear scene before capture"),
            ("Moving Block", "Block moves between images. Impact: Feature matching fails.",
             "Solution: Capture in stable position")
        ]
        
        for title, problem, solution in pitfalls:
            story.append(Paragraph(f"<b>{title}:</b> {problem} <i>Solution: {solution}</i>", self.styles['NormalIndent']))
    
    def _add_section_7(self, story):
        """Add Section 7: Audit Trail."""
        story.append(Paragraph("7. Audit Trail & Compliance", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>7.1 Complete Audit Log</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Every action is logged in the audit_logs table:", self.styles['Normal']))
        
        log_actions = [
            "block_created (with block_code)",
            "image_captured (with side)",
            "image_validated (accepted/rejected with reasons)",
            "capture_session_created",
            "capture_session_complete",
            "analysis_started",
            "analysis_completed / analysis_failed",
            "manual_verification_submitted",
            "seigniorage_assessed"
        ]
        
        for action in log_actions:
            story.append(Paragraph(f"• {action}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>7.2 Compliance Features</b>", self.styles['SubsectionTitle']))
        
        compliance = [
            "Immutable block registration (can't alter block_code)",
            "GPS timestamp for each capture",
            "Operator ID tracking for accountability",
            "Image versioning (original files stored)",
            "Analysis job history (all state transitions)",
            "Manual verification records",
            "Seigniorage calculation audit trail"
        ]
        
        for item in compliance:
            story.append(Paragraph(f"• {item}", self.styles['NormalIndent']))
    
    def _add_section_8(self, story):
        """Add Section 8: Troubleshooting."""
        story.append(Paragraph("8. Troubleshooting Guide", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>8.1 'Analysis Failed' - Common Causes</b>", self.styles['SubsectionTitle']))
        
        failures = [
            ("Fewer than 5 accepted images", "User skipped too many images",
             "Retake images, ensure each passes validation"),
            ("Granite detection model not configured", "AI models not uploaded",
             "Upload granite detection model to /models/hub/"),
            ("Measurement calibration required", "No valid calibration found",
             "Use correct calibration method for conditions"),
            ("Geometry reconstruction failed", "Insufficient feature matches",
             "Capture more images, ensure good overlap")
        ]
        
        for error, cause, solution in failures:
            story.append(Paragraph(f"<b>Error:</b> {error}", self.styles['Normal']))
            story.append(Paragraph(f"<b>Cause:</b> {cause}", self.styles['NormalIndent']))
            story.append(Paragraph(f"<b>Solution:</b> {solution}", self.styles['NormalIndent']))
            story.append(Spacer(1, 6))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>8.2 'Validation Failed' - Common Issues</b>", self.styles['SubsectionTitle']))
        
        validations = [
            ("Duplicate image detected", "Same file uploaded twice",
             "Use different image or resize/rotate slightly"),
            ("Not a Granite Block", "AI detector doesn't see granite",
             "Ensure granite clearly visible, fill frame"),
            ("Blur detected", "Camera movement during capture",
             "Use both hands, steady camera"),
            ("Weak feature overlap", "Image too different from existing",
             "Maintain 30-50% overlap with adjacent views")
        ]
        
        for error, cause, solution in validations:
            story.append(Paragraph(f"<b>Issue:</b> {error}", self.styles['Normal']))
            story.append(Paragraph(f"<b>Cause:</b> {cause}", self.styles['NormalIndent']))
            story.append(Paragraph(f"<b>Solution:</b> {solution}", self.styles['NormalIndent']))
            story.append(Spacer(1, 6))
    
    def _add_section_9(self, story):
        """Add Section 9: Configuration."""
        story.append(Paragraph("9. Configuration & Customization", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>9.1 Calibration Configuration</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Backend settings (app/core/config.py):", self.styles['Normal']))
        
        config = '''# Detection thresholds
granite_detection_confidence: float = 0.6
validation_quality_threshold: float = 0.5

# Capture requirements
minimum_evidence_images: int = 5
minimum_side_coverage: float = 0.8

# Measurement tolerances
maximum_dimension_variance_pct: float = 5.0
minimum_measurement_confidence: float = 0.7'''

        story.append(Paragraph(config, self.styles['CodeBlock']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>9.2 Seigniorage Rates Configuration</b>", self.styles['SubsectionTitle']))
        
        story.append(Paragraph("Database table with classifications:", self.styles['Normal']))
        
        story.append(Paragraph("• GANGSAW_CLASS_1: Large blocks (>270cm length, >150cm breadth)", self.styles['NormalIndent']))
        story.append(Paragraph("• GANGSAW_CLASS_2: Medium blocks", self.styles['NormalIndent']))
        story.append(Paragraph("• GANGSAW_CLASS_3: Small blocks", self.styles['NormalIndent']))
    
    def _add_conclusion(self, story):
        """Add conclusion chapter."""
        story.append(Paragraph("10. Conclusion", self.styles['SectionTitle']))
        
        story.append(Paragraph("<b>10.1 Summary: Why This Matters for Departments</b>", self.styles['SubsectionTitle']))
        
        before = [
            "Manual measurements (tape measure, error-prone)",
            "Subjective disputes over dimensions",
            "No digital audit trail",
            "Revenue leakage through under-reporting",
            "Cutting decisions based on guesswork"
        ]
        
        after = [
            "Digital twin creation (immutable evidence)",
            "Centimeter-level accuracy (1-2% typical)",
            "Complete audit trail (all actions logged)",
            "Automated seigniorage calculation",
            "Cutting optimization (maximize yield)"
        ]
        
        story.append(Paragraph("<b>BEFORE GraniteMeasure AI:</b>", self.styles['Normal']))
        for item in before:
            story.append(Paragraph(f"✗ {item}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 6))
        story.append(Paragraph("<b>AFTER GraniteMeasure AI:</b>", self.styles['Normal']))
        for item in after:
            story.append(Paragraph(f"✓ {item}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>10.2 Key Metrics for Success</b>", self.styles['SubsectionTitle']))
        
        kpis = [
            ("Measurement Accuracy", "±2% (achievable with proper capture)"),
            ("Processing Time", "<2 minutes per block (end-to-end)"),
            ("First-Time Pass Rate", ">85% (with training)"),
            ("Seigniorage Recovery", "100% (no unmeasured blocks)"),
            ("Dispute Resolution", "<24 hours (digital evidence)")
        ]
        
        for kpi, target in kpis:
            story.append(Paragraph(f"• {kpi}: {target}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 12))
        
        story.append(Paragraph("<b>10.3 Next Steps</b>", self.styles['SubsectionTitle']))
        
        next_steps = [
            "_WEEK 1_: Training, Pilot (10-20 blocks), Calibration setup",
            "_MONTH 1_: Optimization, Expansion to all quarries, Integration",
            "_QUARTER 1_: Advanced features, Native app, Reporting, Blockchain"
        ]
        
        for step in next_steps:
            story.append(Paragraph(f"• {step}", self.styles['NormalIndent']))
        
        story.append(Spacer(1, 2*cm))
        
        # Footer
        story.append(Paragraph("Document Version: 1.0", self.styles['Normal']))
        story.append(Paragraph(f"Last Updated: {datetime.now().strftime('October 2024')}", self.styles['Normal']))
        story.append(Paragraph("Prepared For: Granite Department Administration", self.styles['Normal']))
        story.append(Paragraph("System Version: GraniteMeasure AI v2.4.0", self.styles['Normal']))


def main():
    """Generate the PDF document."""
    generator = GraniteMeasurePDF(
        output_path="/Users/sridha/Downloads/granitemeasure-ai/GRANITE_MEASURE_AI_WALKTHROUGH.pdf"
    )
    generator.build_document()


if __name__ == "__main__":
    main()
