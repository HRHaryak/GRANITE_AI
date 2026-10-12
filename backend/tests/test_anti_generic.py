"""
Targeted tests for anti-generic geometric descriptors and similarity detection.
Verifies:
- Vertex reordering produces the identical geometric descriptor and fingerprint
- Rigid translation of vertices produces the identical geometric descriptor
- Materially different granite block shapes produce distinctly different descriptors
- Suspiciously identical meshes are flagged as RECONSTRUCTION_SUSPECT_GENERIC
"""
import numpy as np
import pytest
import trimesh

from app.services.anti_generic import (
    compare_cutting_plans,
    compare_mesh_descriptors,
    compute_mesh_geometric_descriptor,
)


def _make_sample_mesh(L=200.0, B=120.0, H=90.0):
    box = trimesh.creation.box(extents=[L, B, H])
    verts = box.vertices.copy()
    faces = box.faces.copy()
    return verts, faces


def test_vertex_reorder_produces_same_descriptor():
    """Shuffling the vertex order must NOT alter the geometric descriptor or fingerprint."""
    verts, faces = _make_sample_mesh()

    desc_orig = compute_mesh_geometric_descriptor(verts, faces)
    assert desc_orig["valid"] is True

    # Permute vertex order randomly
    np.random.seed(123)
    perm = np.random.permutation(len(verts))
    verts_shuffled = verts[perm]

    desc_shuffled = compute_mesh_geometric_descriptor(verts_shuffled, faces)
    assert desc_shuffled["valid"] is True

    # Fingerprints and quantiles must match exactly
    assert desc_orig["fingerprint"] == desc_shuffled["fingerprint"]
    assert desc_orig["aspect_ratios"] == desc_shuffled["aspect_ratios"]
    assert desc_orig["radial_quantiles"] == desc_shuffled["radial_quantiles"]


def test_translation_produces_same_descriptor():
    """Translating the mesh anywhere in 3D space must NOT change the normalized descriptor."""
    verts, faces = _make_sample_mesh()

    desc_orig = compute_mesh_geometric_descriptor(verts, faces)

    # Shift vertices by (5000 cm, -3200 cm, 840 cm)
    translation = np.array([5000.0, -3200.0, 840.0])
    verts_shifted = verts + translation

    desc_shifted = compute_mesh_geometric_descriptor(verts_shifted, faces)

    assert desc_orig["fingerprint"] == desc_shifted["fingerprint"]
    assert desc_orig["principal_extents_cm"] == desc_shifted["principal_extents_cm"]
    assert desc_orig["aspect_ratios"] == desc_shifted["aspect_ratios"]


def test_different_shapes_produce_different_descriptors():
    """Materially different shapes must produce distinct fingerprints and low similarity."""
    verts_a, faces_a = _make_sample_mesh(300.0, 100.0, 80.0)
    verts_b, faces_b = _make_sample_mesh(120.0, 120.0, 120.0)  # Cube

    desc_a = compute_mesh_geometric_descriptor(verts_a, faces_a)
    desc_b = compute_mesh_geometric_descriptor(verts_b, faces_b)

    assert desc_a["fingerprint"] != desc_b["fingerprint"]
    assert desc_a["aspect_ratios"]["length_to_breadth"] != desc_b["aspect_ratios"]["length_to_breadth"]

    comp = compare_mesh_descriptors(desc_a, desc_b)
    assert comp["is_suspect_generic"] is False
    assert comp["status"] == "DISTINCT_GEOMETRY_CONFIRMED"


def test_identical_shapes_detected_as_suspect_generic():
    """Identical or nearly identical meshes across different blocks must be flagged as suspect generic."""
    verts_a, faces_a = _make_sample_mesh(240.0, 150.0, 110.0)
    # Block B is practically identical with 0.1mm micro-jitter
    np.random.seed(99)
    verts_b = verts_a + np.random.uniform(-0.01, 0.01, size=verts_a.shape)

    desc_a = compute_mesh_geometric_descriptor(verts_a, faces_a)
    desc_b = compute_mesh_geometric_descriptor(verts_b, faces_a)

    comp = compare_mesh_descriptors(desc_a, desc_b, similarity_threshold=0.985)
    assert comp["is_suspect_generic"] is True
    assert comp["status"] == "RECONSTRUCTION_SUSPECT_GENERIC"
    assert len(comp["reasons"]) > 0
