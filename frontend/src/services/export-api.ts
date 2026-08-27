/**
 * Client data export — triggers a browser download of the ZIP
 * @module services/export-api
 */

const API_BASE_URL = '/api';

export async function downloadClientExport(clientUuid: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/export-client-data?clientUuid=${encodeURIComponent(clientUuid)}`);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Export failed (${response.status})`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
    const filename = filenameMatch ? filenameMatch[1] : 'client_export.zip';

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
