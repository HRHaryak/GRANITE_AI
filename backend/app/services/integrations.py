from __future__ import annotations

from abc import ABC, abstractmethod

from app.core.config import get_settings


class WeighbridgeProvider(ABC):
    @abstractmethod
    def fetch(self, source_reference: str) -> dict:
        raise NotImplementedError


class OMEPSProvider(ABC):
    @abstractmethod
    def link_dispatch(self, payload: dict) -> dict:
        raise NotImplementedError


class UnconfiguredWeighbridgeProvider(WeighbridgeProvider):
    def fetch(self, source_reference: str) -> dict:
        return {
            "configured": False,
            "message": "Integration not configured",
            "source_reference": source_reference,
        }


class UnconfiguredOMEPSProvider(OMEPSProvider):
    def link_dispatch(self, payload: dict) -> dict:
        return {"configured": False, "message": "Integration not configured", "payload": payload}


class DemoWeighbridgeProvider(WeighbridgeProvider):
    """Only used when DEMO_MODE=true. Results must be labeled simulated."""

    def fetch(self, source_reference: str) -> dict:
        return {
            "configured": True,
            "demo_simulated": True,
            "message": "DEMO MODE — SIMULATED RESULTS",
            "source_reference": source_reference,
            "vehicle_number": None,
            "gross_weight": None,
            "tare_weight": None,
            "net_weight": None,
            "note": "Demo provider does not invent weighment values.",
        }


class DemoOMEPSProvider(OMEPSProvider):
    def link_dispatch(self, payload: dict) -> dict:
        return {
            "configured": True,
            "demo_simulated": True,
            "message": "DEMO MODE — SIMULATED RESULTS",
            "omeps_reference": None,
            "note": "Demo provider does not invent OMEPS dispatch IDs.",
        }


def get_weighbridge_provider() -> WeighbridgeProvider:
    if get_settings().demo_mode:
        return DemoWeighbridgeProvider()
    return UnconfiguredWeighbridgeProvider()


def get_omeps_provider() -> OMEPSProvider:
    if get_settings().demo_mode:
        return DemoOMEPSProvider()
    return UnconfiguredOMEPSProvider()
