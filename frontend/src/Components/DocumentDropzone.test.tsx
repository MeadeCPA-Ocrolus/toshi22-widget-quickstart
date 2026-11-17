import React from 'react';
import { render, fireEvent, act, waitFor, within } from '@testing-library/react';
import DocumentDropzone from './DocumentDropzone';
import { uploadDocuments } from '../services/documents-api';

jest.mock('../services/documents-api', () => ({
    uploadDocuments: jest.fn(),
}));

const mockUpload = uploadDocuments as jest.Mock;
const CLIENT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const lastYear = String(new Date().getFullYear() - 1);

function file(name: string) {
    return new File(['hello'], name, { type: 'application/pdf' });
}

function setup(onUploadComplete = jest.fn()) {
    const utils = render(<DocumentDropzone clientUuid={CLIENT} onUploadComplete={onUploadComplete} />);
    const dropTarget = () => utils.getByText(/Drag and drop files here|Choose a tax year above/).closest('div[class*="MuiPaper"]') as HTMLElement;
    const chooseYear = () => {
        const trigger = utils.container.querySelector('[role="combobox"], [aria-haspopup="listbox"]') as HTMLElement;
        fireEvent.mouseDown(trigger);
        fireEvent.click(within(document.body).getByRole('option', { name: lastYear }));
    };
    const drop = (names: string[]) =>
        fireEvent.drop(dropTarget(), { dataTransfer: { files: names.map(file) } });
    return { ...utils, chooseYear, drop, onUploadComplete };
}

beforeEach(() => {
    jest.useFakeTimers();
    mockUpload.mockReset();
});
afterEach(() => {
    jest.useRealTimers();
});

describe('DocumentDropzone', () => {
    it('ignores drops until a tax year is chosen', () => {
        const { drop, getByText } = setup();
        drop(['a.pdf']);
        expect(mockUpload).not.toHaveBeenCalled();
        expect(getByText('Choose a tax year above to enable uploads')).toBeInTheDocument();
    });

    it('shows a failure with its reason, time and reference, and a duplicate with the existing file', async () => {
        mockUpload.mockImplementation(async (_c: string, _f: File[], _y: number, done: Function) => {
            done(0, { filename: 'big.pdf', error: 'File is too large. The limit is 50 MB' });
            done(1, { filename: 'again.pdf', docId: 'd1', duplicate: true, existingFilename: 'first.pdf', existingUploadedAt: '2026-11-01T10:00:00Z' });
            done(2, { filename: 'boom.pdf', error: 'Upload failed. Try again.', correlationId: '4f2a9c1e-7b3d-4e1a-9c05-0123456789ab', status: 500 });
            done(3, { filename: 'fine.pdf', docId: 'd2', duplicate: false });
            return [];
        });
        const { chooseYear, drop, getByText, getByRole, queryByText, onUploadComplete } = setup();
        chooseYear();
        await act(async () => { drop(['big.pdf', 'again.pdf', 'boom.pdf', 'fine.pdf']); });

        expect(getByRole('alert')).toHaveTextContent('2 failed, 1 already uploaded');
        expect(getByText(/File is too large\. The limit is 50 MB/)).toBeInTheDocument();
        expect(getByText(/Already uploaded as first\.pdf on /)).toBeInTheDocument();
        expect(getByText('Reference: 4f2a9c1e')).toBeInTheDocument();
        expect(queryByText(/Reference: .*File is too large/)).toBeNull();
        expect(getByText(/^Uploaded · /)).toBeInTheDocument();
        expect(onUploadComplete).toHaveBeenCalledTimes(1);
    });

    it('clears saved lines after 10 seconds but keeps failures and duplicates', async () => {
        mockUpload.mockImplementation(async (_c: string, _f: File[], _y: number, done: Function) => {
            done(0, { filename: 'bad.exe', error: 'File type not allowed. Allowed types: pdf' });
            done(1, { filename: 'fine.pdf', docId: 'd2', duplicate: false });
            return [];
        });
        const { chooseYear, drop, getByText, queryByText } = setup();
        chooseYear();
        await act(async () => { drop(['bad.exe', 'fine.pdf']); });
        expect(getByText('fine.pdf')).toBeInTheDocument();

        act(() => { jest.advanceTimersByTime(10000); });
        expect(queryByText('fine.pdf')).toBeNull();
        expect(getByText('bad.exe')).toBeInTheDocument();

        act(() => { jest.advanceTimersByTime(10 * 60 * 1000); });
        expect(getByText('bad.exe')).toBeInTheDocument();
    });

    it('shows a green banner when everything is saved, then it goes away', async () => {
        mockUpload.mockImplementation(async (_c: string, _f: File[], _y: number, done: Function) => {
            done(0, { filename: 'a.pdf', docId: '1', duplicate: false });
            done(1, { filename: 'b.pdf', docId: '2', duplicate: false });
            return [];
        });
        const { chooseYear, drop, getByText, queryByText } = setup();
        chooseYear();
        await act(async () => { drop(['a.pdf', 'b.pdf']); });
        expect(getByText('2 files uploaded')).toBeInTheDocument();
        act(() => { jest.advanceTimersByTime(10000); });
        expect(queryByText('2 files uploaded')).toBeNull();
    });

    it('dismisses a line, updates the banner, and "Clear all" removes the rest', async () => {
        mockUpload.mockImplementation(async (_c: string, _f: File[], _y: number, done: Function) => {
            done(0, { filename: 'one.exe', error: 'File type not allowed. Allowed types: pdf' });
            done(1, { filename: 'two.exe', error: 'File type not allowed. Allowed types: pdf' });
            return [];
        });
        const { chooseYear, drop, getByRole, getByLabelText, getByText, queryByRole } = setup();
        chooseYear();
        await act(async () => { drop(['one.exe', 'two.exe']); });
        expect(getByRole('alert')).toHaveTextContent('2 files failed');

        fireEvent.click(getByLabelText('Dismiss one.exe'));
        expect(getByRole('alert')).toHaveTextContent('1 file failed');

        fireEvent.click(getByText('Clear all'));
        expect(queryByRole('alert')).toBeNull();
    });

    it('keeps the chosen year and the lines after a batch finishes', async () => {
        mockUpload.mockImplementation(async (_c: string, _f: File[], _y: number, done: Function) => {
            done(0, { filename: 'bad.exe', error: 'File type not allowed. Allowed types: pdf' });
            return [];
        });
        const { chooseYear, drop, getByText } = setup();
        chooseYear();
        await act(async () => { drop(['bad.exe']); });
        expect(getByText('These files will be filed under this tax year')).toBeInTheDocument();
        expect(getByText('bad.exe')).toBeInTheDocument();
        expect(mockUpload.mock.calls[0][2]).toBe(Number(lastYear));
    });

    it('shows "Uploading 2 of 3…" and asks before the tab closes while uploading', async () => {
        let finish: () => void = () => {};
        mockUpload.mockImplementation((_c: string, _f: File[], _y: number, done: Function) =>
            new Promise<void>((resolve) => {
                done(0, { filename: 'a.pdf', docId: '1', duplicate: false });
                finish = () => {
                    done(1, { filename: 'b.pdf', docId: '2', duplicate: false });
                    done(2, { filename: 'c.pdf', docId: '3', duplicate: false });
                    resolve();
                };
            })
        );
        const { chooseYear, drop, getByText } = setup();
        chooseYear();
        await act(async () => { drop(['a.pdf', 'b.pdf', 'c.pdf']); });

        expect(getByText('Uploading 2 of 3…')).toBeInTheDocument();
        const during = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(during);
        expect(during.defaultPrevented).toBe(true);

        await act(async () => { finish(); });
        const after = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });
});
