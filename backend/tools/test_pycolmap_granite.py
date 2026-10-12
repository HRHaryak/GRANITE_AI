from __future__ import annotations

import shutil
import sqlite3
import statistics
import traceback
from pathlib import Path

import cv2
import numpy as np
import pycolmap

from app.core.config import get_settings


SESSION_ID = "9d948f90-2fc4-4bc3-8cac-8a12bcdba5a1"
JOB_ID = "198c0831-5bcf-40f5-88fe-6319945d6f7c"

MIN_NUM_MATCHES = 8
INIT_MIN_NUM_INLIERS = 8
ABS_POSE_MIN_NUM_INLIERS = 6

MAX_IMAGE_ID = 2147483647


def heading(title: str) -> None:
    print()
    print("=" * 100)
    print(title)
    print("=" * 100)


def backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def storage_root() -> Path:
    settings = get_settings()
    configured = Path(settings.local_storage_dir)

    if configured.is_absolute():
        return configured.resolve()

    return (backend_root() / configured).resolve()


def load_source_images() -> list[dict]:
    db_path = backend_root() / "granitemeasure.db"

    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row

    try:
        rows = db.execute(
            """
            SELECT
                id,
                sequence_number,
                capture_side,
                original_filename,
                storage_path,
                width_px,
                height_px,
                accepted,
                rejected
            FROM block_images
            WHERE capture_session_id = ?
            ORDER BY sequence_number
            """,
            (SESSION_ID,),
        ).fetchall()
    finally:
        db.close()

    root = storage_root()

    result = []

    for row in rows:
        result.append(
            {
                "id": row["id"],
                "sequence": row["sequence_number"],
                "side": row["capture_side"],
                "filename": row["original_filename"],
                "source": (
                    root / row["storage_path"]
                ).resolve(),
                "mask": (
                    root
                    / "masks"
                    / JOB_ID
                    / f'{row["id"]}.png'
                ).resolve(),
                "width": row["width_px"],
                "height": row["height_px"],
                "accepted": bool(row["accepted"]),
                "rejected": bool(row["rejected"]),
            }
        )

    return result


def create_masked_images(
    images: list[dict],
    image_dir: Path,
) -> None:
    image_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    for index, item in enumerate(images, 1):
        source = cv2.imread(
            str(item["source"]),
            cv2.IMREAD_COLOR,
        )

        mask = cv2.imread(
            str(item["mask"]),
            cv2.IMREAD_GRAYSCALE,
        )

        if source is None:
            raise RuntimeError(
                f"Could not decode source: {item['source']}"
            )

        if mask is None:
            raise RuntimeError(
                f"Could not decode mask: {item['mask']}"
            )

        if mask.shape[:2] != source.shape[:2]:
            mask = cv2.resize(
                mask,
                (
                    source.shape[1],
                    source.shape[0],
                ),
                interpolation=cv2.INTER_NEAREST,
            )

        binary = np.where(
            mask > 127,
            255,
            0,
        ).astype(np.uint8)

        coverage = (
            np.count_nonzero(binary)
            / binary.size
        )

        # Keep only pixels supported by the segmentation mask.
        masked = cv2.bitwise_and(
            source,
            source,
            mask=binary,
        )

        destination = (
            image_dir
            / f"PHOTO_{index:03d}.jpg"
        )

        ok = cv2.imwrite(
            str(destination),
            masked,
            [
                cv2.IMWRITE_JPEG_QUALITY,
                95,
            ],
        )

        if not ok:
            raise RuntimeError(
                f"Could not write masked image: {destination}"
            )

        item["probe_name"] = destination.name
        item["mask_coverage"] = coverage

        print()
        print(f"PHOTO_{index:03d}")
        print("Source        :", item["source"])
        print("Mask          :", item["mask"])
        print(
            "Mask coverage :",
            f"{coverage * 100:.2f}%",
        )
        print("Output        :", destination)


def decode_pair_id(
    pair_id: int,
) -> tuple[int, int]:
    image_id2 = pair_id % MAX_IMAGE_ID
    image_id1 = (
        pair_id - image_id2
    ) // MAX_IMAGE_ID

    return image_id1, image_id2


def inspect_pair_connectivity(
    database_path: Path,
) -> list[dict]:
    db = sqlite3.connect(database_path)

    try:
        images = {
            row[0]: row[1]
            for row in db.execute(
                """
                SELECT image_id, name
                FROM images
                ORDER BY image_id
                """
            )
        }

        raw = {}

        for pair_id, rows in db.execute(
            """
            SELECT pair_id, rows
            FROM matches
            """
        ):
            a, b = decode_pair_id(pair_id)
            raw[
                (
                    min(a, b),
                    max(a, b),
                )
            ] = int(rows)

        verified = {}

        for pair_id, rows, config in db.execute(
            """
            SELECT pair_id, rows, config
            FROM two_view_geometries
            """
        ):
            a, b = decode_pair_id(pair_id)

            verified[
                (
                    min(a, b),
                    max(a, b),
                )
            ] = (
                int(rows),
                int(config),
            )

        ids = sorted(images)
        results = []

        for i in range(len(ids)):
            for j in range(
                i + 1,
                len(ids),
            ):
                a = ids[i]
                b = ids[j]

                key = (
                    min(a, b),
                    max(a, b),
                )

                raw_count = raw.get(
                    key,
                    0,
                )

                verified_count, config = (
                    verified.get(
                        key,
                        (0, 0),
                    )
                )

                results.append(
                    {
                        "a": images[a],
                        "b": images[b],
                        "raw": raw_count,
                        "verified": verified_count,
                        "config": config,
                    }
                )

        return results

    finally:
        db.close()


def track_length(point) -> int:
    try:
        return int(
            point.track.length()
        )
    except Exception:
        pass

    try:
        return len(
            point.track.elements
        )
    except Exception:
        return 0


def point_error(point) -> float | None:
    try:
        value = float(point.error)

        if np.isfinite(value) and value >= 0:
            return value

    except Exception:
        pass

    return None


def summarize_model(
    model_id,
    reconstruction,
) -> dict:
    names = []

    for image in reconstruction.images.values():
        try:
            registered = bool(
                image.has_pose
            )
        except Exception:
            registered = True

        if registered:
            names.append(
                str(image.name)
            )

    points = list(
        reconstruction.points3D.values()
    )

    lengths = [
        track_length(point)
        for point in points
    ]

    errors = [
        value
        for point in points
        if (
            value := point_error(point)
        ) is not None
    ]

    return {
        "model_id": model_id,
        "registered": len(names),
        "names": sorted(names),
        "points": len(points),
        "tracks3": sum(
            value >= 3
            for value in lengths
        ),
        "tracks4": sum(
            value >= 4
            for value in lengths
        ),
        "max_track": max(
            lengths,
            default=0,
        ),
        "mean_error": (
            statistics.fmean(errors)
            if errors
            else None
        ),
        "median_error": (
            statistics.median(errors)
            if errors
            else None
        ),
    }


def main() -> int:
    heading(
        "GRANITEMEASURE — MASKED PYCOLMAP SFM PROBE"
    )

    print(
        "PyCOLMAP version :",
        pycolmap.__version__,
    )
    print(
        "Capture session  :",
        SESSION_ID,
    )
    print(
        "Analysis job     :",
        JOB_ID,
    )

    print()
    print(
        "This probe uses the ACTUAL segmentation masks "
        "generated by GraniteMeasure."
    )
    print(
        "It does not modify reconstruction.py."
    )

    images = load_source_images()

    if len(images) != 4:
        raise RuntimeError(
            f"Expected 4 images, found {len(images)}"
        )

    heading("VERIFYING SOURCE EVIDENCE")

    for item in images:
        print()
        print(item["side"])
        print(
            "Source exists:",
            item["source"].is_file(),
        )
        print(
            "Mask exists  :",
            item["mask"].is_file(),
        )

        if not item["source"].is_file():
            raise RuntimeError(
                f"Missing source: {item['source']}"
            )

        if not item["mask"].is_file():
            raise RuntimeError(
                f"Missing mask: {item['mask']}"
            )

    work_root = (
        storage_root()
        / "diagnostics"
        / "pycolmap_granite_masked_probe"
        / SESSION_ID
    )

    if work_root.exists():
        shutil.rmtree(work_root)

    image_dir = (
        work_root / "images"
    )

    sparse_dir = (
        work_root / "sparse"
    )

    database_path = (
        work_root / "database.db"
    )

    sparse_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    heading("CREATING MASKED GRANITE IMAGES")

    create_masked_images(
        images,
        image_dir,
    )

    image_names = [
        item["probe_name"]
        for item in images
    ]

    heading("STEP 1 — MASKED SIFT EXTRACTION")

    pycolmap.extract_features(
        database_path=database_path,
        image_path=image_dir,
        image_names=image_names,
        camera_mode=pycolmap.CameraMode.AUTO,
        device=pycolmap.Device.cpu,
    )

    print(
        "Masked feature extraction completed."
    )

    heading("STEP 2 — MASKED EXHAUSTIVE MATCHING")

    pycolmap.match_exhaustive(
        database_path=database_path,
        device=pycolmap.Device.cpu,
    )

    print(
        "Masked exhaustive matching completed."
    )

    heading("MASKED PAIR CONNECTIVITY")

    pairs = inspect_pair_connectivity(
        database_path
    )

    connected_pairs = 0

    for pair in pairs:
        print()
        print(
            f"{pair['a']} <-> {pair['b']}"
        )
        print(
            "  Raw matches      :",
            pair["raw"],
        )
        print(
            "  Verified inliers :",
            pair["verified"],
        )
        print(
            "  Geometry config  :",
            pair["config"],
        )

        if pair["verified"] >= MIN_NUM_MATCHES:
            connected_pairs += 1

    print()
    print(
        "Pairs with >=",
        MIN_NUM_MATCHES,
        "verified inliers:",
        connected_pairs,
        "/ 6",
    )

    heading("STEP 3 — MASKED INCREMENTAL SFM")

    options = (
        pycolmap.IncrementalPipelineOptions()
    )

    options.min_num_matches = (
        MIN_NUM_MATCHES
    )

    options.multiple_models = False
    options.min_model_size = 2
    options.random_seed = 0

    options.mapper.init_min_num_inliers = (
        INIT_MIN_NUM_INLIERS
    )

    options.mapper.abs_pose_min_num_inliers = (
        ABS_POSE_MIN_NUM_INLIERS
    )

    options.mapper.init_max_error = 4.0
    options.mapper.abs_pose_max_error = 12.0
    options.mapper.filter_max_reproj_error = 4.0

    print(
        "min_num_matches          =",
        options.min_num_matches,
    )
    print(
        "init_min_num_inliers     =",
        options.mapper.init_min_num_inliers,
    )
    print(
        "abs_pose_min_num_inliers =",
        options.mapper.abs_pose_min_num_inliers,
    )

    reconstructions = (
        pycolmap.incremental_mapping(
            database_path=database_path,
            image_path=image_dir,
            output_path=sparse_dir,
            options=options,
        )
    )

    heading("MASKED SFM RESULT")

    print(
        "Returned model count:",
        len(reconstructions),
    )

    summaries = []

    for model_id, reconstruction in (
        reconstructions.items()
    ):
        summary = summarize_model(
            model_id,
            reconstruction,
        )

        summaries.append(summary)

        print()
        print("MODEL:", model_id)
        print(
            "Registered cameras:",
            summary["registered"],
            "/ 4",
        )

        for name in summary["names"]:
            print(
                "  REGISTERED:",
                name,
            )

        print(
            "Sparse points     :",
            summary["points"],
        )
        print(
            "Tracks >=3 views  :",
            summary["tracks3"],
        )
        print(
            "Tracks >=4 views  :",
            summary["tracks4"],
        )
        print(
            "Max track length  :",
            summary["max_track"],
        )

        if summary["mean_error"] is not None:
            print(
                "Mean point error  :",
                f'{summary["mean_error"]:.6f} px',
            )

        if summary["median_error"] is not None:
            print(
                "Median point error:",
                f'{summary["median_error"]:.6f} px',
            )

    heading("FINAL A/B DIAGNOSTIC")

    print("UNMASKED PYCOLMAP")
    print(
        "  Connected pair:"
        " PHOTO_002 <-> PHOTO_003"
    )
    print(
        "  Raw matches     : 135"
    )
    print(
        "  Verified inliers: 122"
    )
    print(
        "  Other five pairs: 0"
    )
    print(
        "  Sparse models   : 0"
    )

    print()
    print("MASKED PYCOLMAP")
    print(
        "  Connected pairs :",
        connected_pairs,
        "/ 6",
    )

    if summaries:
        best = max(
            summaries,
            key=lambda item: (
                item["registered"],
                item["tracks3"],
                item["points"],
            ),
        )

        print(
            "  Registered      :",
            best["registered"],
            "/ 4",
        )
        print(
            "  Sparse points   :",
            best["points"],
        )
        print(
            "  Tracks >=3      :",
            best["tracks3"],
        )

        heading("DECISION")

        if (
            best["registered"] >= 3
            and best["tracks3"] > 0
        ):
            print(
                "PREPROCESSING / MASKING IS MATERIAL."
            )
            print()
            print(
                "The segmentation masks enabled genuine "
                "multi-view continuity."
            )
            print(
                "Next engineering work should integrate "
                "mask-aware SfM rather than changing capture "
                "requirements immediately."
            )

        elif best["registered"] >= 3:
            print(
                "MASKING IMPROVED REGISTRATION, "
                "BUT MULTI-VIEW TRACK EVIDENCE IS STILL WEAK."
            )
            print()
            print(
                "Do not authorize production geometry yet."
            )

        else:
            print(
                "CAPTURE OVERLAP REMAINS THE PRIMARY LIMITATION."
            )
            print()
            print(
                "Even granite-isolated imagery could not "
                "establish >=3-camera reconstruction."
            )
            print(
                "Next work should improve progressive "
                "overlapping mobile capture."
            )

    else:
        heading("DECISION")

        print(
            "CAPTURE OVERLAP REMAINS THE PRIMARY LIMITATION."
        )
        print()
        print(
            "Masking did not produce a sparse model."
        )
        print(
            "Do not lower geometry thresholds merely "
            "to force a 3D result."
        )

    print()
    print(
        "Production geometry authorized:",
        False,
    )
    print(
        "Metric measurement authorized:",
        False,
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(
            main()
        )

    except KeyboardInterrupt:
        print()
        print(
            "Probe interrupted by user."
        )
        raise SystemExit(130)

    except Exception as exc:
        heading("PROBE FAILED")

        print(
            f"{type(exc).__name__}: {exc}"
        )
        print()

        traceback.print_exc()

        raise SystemExit(1)