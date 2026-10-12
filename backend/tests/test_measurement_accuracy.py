from __future__ import annotations

import pytest

from app.services.measurement_accuracy import calculate_measurement_accuracy


def test_exact_ground_truth_is_100_percent():
    result = calculate_measurement_accuracy(
        ai_length_cm=280,
        ai_breadth_cm=165,
        ai_height_cm=138,
        verified_length_cm=280,
        verified_breadth_cm=165,
        verified_height_cm=138,
    )

    assert result.length.accuracy_pct == 100.0
    assert result.breadth.accuracy_pct == 100.0
    assert result.height.accuracy_pct == 100.0
    assert result.mean_axis_accuracy_pct == 100.0
    assert result.worst_axis_accuracy_pct == 100.0
    assert result.envelope_volume_accuracy_pct == 100.0
    assert result.target_met is True


def test_accuracy_uses_verified_physical_value_as_denominator():
    result = calculate_measurement_accuracy(
        ai_length_cm=90,
        ai_breadth_cm=100,
        ai_height_cm=100,
        verified_length_cm=100,
        verified_breadth_cm=100,
        verified_height_cm=100,
    )

    assert result.length.absolute_percentage_error_pct == 10.0
    assert result.length.accuracy_pct == 90.0
    assert result.mean_axis_accuracy_pct == pytest.approx(96.6667, abs=1e-4)


def test_one_bad_axis_fails_target_even_if_average_is_high():
    result = calculate_measurement_accuracy(
        ai_length_cm=99,
        ai_breadth_cm=99,
        ai_height_cm=70,
        verified_length_cm=100,
        verified_breadth_cm=100,
        verified_height_cm=100,
        target_accuracy_pct=80,
    )

    assert result.mean_axis_accuracy_pct > 80.0
    assert result.height.accuracy_pct == 70.0
    assert result.worst_axis_accuracy_pct == 70.0
    assert result.target_met is False


def test_realistic_small_errors_are_reported_not_hidden():
    result = calculate_measurement_accuracy(
        ai_length_cm=276,
        ai_breadth_cm=160,
        ai_height_cm=132,
        verified_length_cm=280,
        verified_breadth_cm=165,
        verified_height_cm=138,
        target_accuracy_pct=80,
    )

    assert result.length.absolute_error_cm == 4.0
    assert result.breadth.absolute_error_cm == 5.0
    assert result.height.absolute_error_cm == 6.0
    assert result.length.accuracy_pct < 100.0
    assert result.envelope_volume_accuracy_pct < 100.0
    assert result.target_met is True


def test_invalid_ground_truth_is_rejected():
    with pytest.raises(ValueError):
        calculate_measurement_accuracy(
            ai_length_cm=100,
            ai_breadth_cm=100,
            ai_height_cm=100,
            verified_length_cm=0,
            verified_breadth_cm=100,
            verified_height_cm=100,
        )


def test_target_must_be_valid_percentage():
    with pytest.raises(ValueError):
        calculate_measurement_accuracy(
            ai_length_cm=100,
            ai_breadth_cm=100,
            ai_height_cm=100,
            verified_length_cm=100,
            verified_breadth_cm=100,
            verified_height_cm=100,
            target_accuracy_pct=105,
        )
