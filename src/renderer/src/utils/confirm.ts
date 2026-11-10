// 0 is the first button (the action); Cancel is the default
const CONFIRM = 0;

// A warning box with the action button and Cancel. True when confirmed.
export async function confirm(
    message: string,
    detail: string,
    button: string
): Promise<boolean> {
    const { response } = await window.electronAPI.showMessageBox({
        type: 'warning',
        message,
        detail,
        buttons: [button, 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return response === CONFIRM;
}
