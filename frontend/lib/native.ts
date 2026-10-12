import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { Filesystem } from "@capacitor/filesystem";

export type FieldLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function captureNativePhoto(): Promise<File> {
  if (!isNativeApp()) {
    throw new Error("Native camera capture is only available inside the mobile app.");
  }

  const permission = await Camera.requestPermissions({
    permissions: ["camera", "photos"],
  });

  if (permission.camera !== "granted") {
    throw new Error("Camera permission was denied.");
  }

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });

  const fileName = `capture-${Date.now()}.jpg`;

  if (photo.webPath) {
    const response = await fetch(photo.webPath);

    if (!response.ok) {
      throw new Error("Unable to read the captured image.");
    }

    const blob = await response.blob();

    return new File([blob], fileName, {
      type: blob.type || "image/jpeg",
    });
  }

  if (!photo.path) {
    throw new Error("The camera did not return an image path.");
  }

  const stored = await Filesystem.readFile({
    path: photo.path,
  });

  if (typeof stored.data !== "string") {
    throw new Error("The captured image could not be converted to a file.");
  }

 const binary = decodeBase64(stored.data);

// Copy into a real ArrayBuffer-backed buffer.
// This avoids TypeScript's ArrayBufferLike / SharedArrayBuffer incompatibility
// when constructing a browser File.
const buffer = new ArrayBuffer(binary.byteLength);
new Uint8Array(buffer).set(binary);

return new File([buffer], fileName, {
  type: "image/jpeg",
});
}

export async function getFieldLocation(): Promise<FieldLocation> {
  if (isNativeApp()) {
    const permission = await Geolocation.requestPermissions({
      permissions: ["location"],
    });

    if (permission.location !== "granted") {
      throw new Error("GPS permission was denied.");
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return normalizeLocation(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy,
    );
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("GPS is unavailable on this device or browser.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve(
            normalizeLocation(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy,
            ),
          );
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        reject(
          new Error(
            error.message ||
              "GPS permission was denied or the location could not be determined.",
          ),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}

function normalizeLocation(
  latitude: number,
  longitude: number,
  accuracy?: number | null,
): FieldLocation {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("The device returned an invalid latitude.");
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("The device returned an invalid longitude.");
  }

  return {
    latitude,
    longitude,
    ...(typeof accuracy === "number" && Number.isFinite(accuracy)
      ? { accuracy }
      : {}),
  };
}

function decodeBase64(value: string): Uint8Array {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;

  if (typeof atob === "function") {
    return Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
  }

  throw new Error("Base64 decoding is unavailable in this environment.");
}
