"""
Targeted tests for block-specific mesh-native granite cutting.
Verifies:
- Two different irregular meshes produce materially different cut plans
- Adding/changing a protrusion changes the cut plane position/reason
- Changing target dimensions modifies the resulting dressed block extents
- Removed volumes are validated from geometry
- Dimensional fallback remains explicitly labeled TEMPLATE_FALLBACK
"""
import numpy as np
import pytest
import trimesh

from app.services.cutting import optimize_cutting, optimize_cutting_mesh_native


def _create_irregular_block(L=250.0, B=160.0, H=140.0, protrusion_dx=0.0, protrusion_dy=0.0):
    """Create an irregular granite mesh with specific protrusions/shape features."""
    box = trimesh.creation.box(extents=[L, B, H])
    verts = box.vertices.copy()
    faces = box.faces.copy()

    # Apply protrusion to specific corner vertices
    if protrusion_dx > 0:
        mask_pos_x = (verts[:, 0] > (L / 2.0 - 5.0)) & (verts[:, 1] > 0.0)
        verts[mask_pos_x, 0] += protrusion_dx

    if protrusion_dy > 0:
        mask_pos_y = (verts[:, 1] > (B / 2.0 - 5.0)) & (verts[:, 0] > 0.0)
        verts[mask_pos_y, 1] += protrusion_dy

    # Apply subtle surface irregularity
    np.random.seed(42)
    noise = np.random.uniform(-1.0, 1.0, size=verts.shape)
    verts += noise

    return verts, faces


def test_two_different_meshes_produce_different_cut_plans():
    """Two granite blocks with different geometry must produce different cutting plans."""
    verts_a, faces_a = _create_irregular_block(250.0, 150.0, 120.0, protrusion_dx=15.0)
    verts_b, faces_b = _create_irregular_block(180.0, 200.0, 100.0, protrusion_dy=12.0)

    plan_a = optimize_cutting_mesh_native(
        mesh_vertices=verts_a,
        mesh_triangles=faces_a,
        mesh_units="cm",
        metric_scale_solved=True,
    )
    plan_b = optimize_cutting_mesh_native(
        mesh_vertices=verts_b,
        mesh_triangles=faces_b,
        mesh_units="cm",
        metric_scale_solved=True,
    )

    assert plan_a["mesh_native_cutting_authorized"] is True
    assert plan_b["mesh_native_cutting_authorized"] is True
    assert plan_a["geometry_mode"] == "BLOCK_SPECIFIC_MESH_NATIVE_CUTTING"
    assert plan_b["geometry_mode"] == "BLOCK_SPECIFIC_MESH_NATIVE_CUTTING"

    # Cutting steps must differ
    steps_a = plan_a["cutting_steps"]
    steps_b = plan_b["cutting_steps"]
    assert len(steps_a) > 0 and len(steps_b) > 0

    # Plane positions and dimensions must differ
    pos_a = [s["position_cm"] for s in steps_a]
    pos_b = [s["position_cm"] for s in steps_b]
    assert pos_a != pos_b, "Different block shapes must not produce identical cut positions"


def test_protrusion_changes_cut_plan():
    """Adding a protrusion to a face must shift the cut plane and change the reason code."""
    verts_clean, faces = _create_irregular_block(220.0, 140.0, 110.0, protrusion_dx=0.0)
    verts_protruded, _ = _create_irregular_block(220.0, 140.0, 110.0, protrusion_dx=20.0)

    plan_clean = optimize_cutting_mesh_native(
        mesh_vertices=verts_clean,
        mesh_triangles=faces,
        mesh_units="cm",
        metric_scale_solved=True,
    )
    plan_protruded = optimize_cutting_mesh_native(
        mesh_vertices=verts_protruded,
        mesh_triangles=faces,
        mesh_units="cm",
        metric_scale_solved=True,
    )

    step1_clean = plan_clean["cutting_steps"][0]
    step1_protruded = plan_protruded["cutting_steps"][0]

    # Cut 1 on the protruded block must detect the protrusion
    assert step1_protruded["waste_category"] == "PROTRUSION_REMOVAL"
    assert "protrusion" in step1_protruded["reason"].lower()
    # Position must differ
    assert step1_protruded["position_cm"] != step1_clean["position_cm"]


def test_target_dimensions_change_dressed_block():
    """Buyer target dimensions must guide the dressed cut dimensions."""
    verts, faces = _create_irregular_block(280.0, 180.0, 150.0)

    target_a = {"length_cm": 240.0, "breadth_cm": 150.0, "height_cm": 120.0}
    target_b = {"length_cm": 200.0, "breadth_cm": 130.0, "height_cm": 100.0}

    plan_a = optimize_cutting_mesh_native(
        mesh_vertices=verts,
        mesh_triangles=faces,
        buyer_target_dimensions=target_a,
    )
    plan_b = optimize_cutting_mesh_native(
        mesh_vertices=verts,
        mesh_triangles=faces,
        buyer_target_dimensions=target_b,
    )

    dims_a = plan_a["final_dressed_dimensions"]
    dims_b = plan_b["final_dressed_dimensions"]

    assert dims_a["length_cm"] > dims_b["length_cm"]
    assert dims_a["breadth_cm"] > dims_b["breadth_cm"]
    assert plan_a["usable_volume_m3"] > plan_b["usable_volume_m3"]


def test_removed_volume_validated_from_geometry():
    """Removed volumes in cutting steps must be non-negative and derived from geometry."""
    verts, faces = _create_irregular_block(220.0, 140.0, 110.0, protrusion_dx=10.0)

    plan = optimize_cutting_mesh_native(
        mesh_vertices=verts,
        mesh_triangles=faces,
    )

    for step in plan["cutting_steps"]:
        vol = step["removed_volume_m3"]
        assert vol >= 0.0, "Removed volume cannot be negative"
        assert step["removed_volume_status"] in {
            "MEASURED_FROM_CLOSED_GEOMETRY",
            "MEASURED_FROM_MESH_VOLUME_DELTA",
            "ESTIMATED_FROM_REMOVED_CONVEX_HULL",
            "REMOVED_VOLUME_UNAVAILABLE",
        }


def test_template_fallback_remains_clearly_separate():
    """When mesh is missing, cutting falls back to dimensional template labeled TEMPLATE_FALLBACK."""
    res = optimize_cutting(
        length_cm=250.0,
        breadth_cm=150.0,
        height_cm=120.0,
        mesh_vertices=None,
        mesh_triangles=None,
    )

    assert res["mesh_native_cutting_authorized"] is False
    assert res["geometry_mode"] == "TEMPLATE_FALLBACK"
    assert "TEMPLATE_FALLBACK" in res["label"]
