import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export async function notifyCycleFinished(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }
    if (!permissionGranted) return false;
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
