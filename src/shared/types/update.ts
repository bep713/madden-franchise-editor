// Updater events main sends (main/services/updateController.js), as
// electronAPI.update.onStatus and electronAPI.getUpdateStatus return them.
// Older payloads may lack `manual`; treat a missing one as manual.

export type UpdateChannelName = 'stable' | 'nightly';

export type UpdateErrorPhase = 'check' | 'download';

export interface UpdateReadyData {
    version: string;
    currentVersion: string;
    // Channel of the offered build, not the user's preference
    channel: UpdateChannelName;
    releaseName?: string;
    manual?: boolean;
}

export interface UpdateErrorData {
    message: string;
    manual?: boolean;
    phase: UpdateErrorPhase;
}

// electron-updater's ProgressInfo
export interface UpdateProgressData {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
}

export type UpdateStatus =
    | { channel: 'checking-for-updates'; data: { manual?: boolean } }
    | { channel: 'update-ready'; data: UpdateReadyData }
    | { channel: 'update-not-available'; data: { manual?: boolean } }
    | { channel: 'update-error'; data: UpdateErrorData }
    | { channel: 'update-downloading'; data?: undefined }
    | { channel: 'update-progress'; data: UpdateProgressData }
    | { channel: 'update-downloaded'; data?: undefined };

export type UpdateStatusChannel = UpdateStatus['channel'];
