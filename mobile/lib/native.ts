import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export async function capturePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera permission was denied.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: true });
  return result.canceled ? null : result.assets[0];
}

export async function choosePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: true });
  return result.canceled ? null : result.assets[0];
}

export async function locate() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission was denied.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? undefined, captured_at: new Date(position.timestamp).toISOString() };
}
