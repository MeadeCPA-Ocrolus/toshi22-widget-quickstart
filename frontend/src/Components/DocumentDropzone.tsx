import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    IconButton,
    CircularProgress,
    Alert,
    Button,
    TextField,
    MenuItem,
} from '@mui/material';
import {
    CloudUpload,
    InsertDriveFile,
    CheckCircle,
    Error as ErrorIcon,
    Close,
    ContentCopy,
} from '@mui/icons-material';
import { uploadDocuments, UploadResult, UploadFailure } from '../services/documents-api';
import { shortReference, summarizeOutcome } from '../services/upload-messages';

interface DocumentDropzoneProps {
    /** The client's UUID — never pass the internal client_id here */
    clientUuid: string;
    /** Called after each upload batch completes, so the parent can refresh its document list */
    onUploadComplete?: () => void;
}

type LineStatus = 'pending' | 'done' | 'duplicate' | 'error';

interface FileLine {
    id: number;
    name: string;
    status: LineStatus;
    /** Reason for a failure, or the "already uploaded as ..." text for a duplicate */
    message?: string;
    /** A note under a saved file, e.g. the same file is also filed under another year */
    note?: string;
    /** First 8 characters of the reference id the API sends with server errors */
    reference?: string;
    at: Date;
}

/** How many tax years the dropdown offers, counting back from this year. */
const TAX_YEAR_CHOICES = 11;
/** Saved lines clear this long after the last change, but only when no failure or duplicate is on screen. */
const SUCCESS_LINE_MS = 10000;
/** The list scrolls after about six lines. */
const LIST_MAX_HEIGHT = 336;

const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function applyResult(line: FileLine, result: UploadResult | UploadFailure): FileLine {
    const at = new Date();
    if ('error' in result) {
        return { ...line, status: 'error', message: result.error, reference: shortReference(result.correlationId), at };
    }
    if (result.duplicate) {
        const when = result.existingUploadedAt ? ` on ${new Date(result.existingUploadedAt).toLocaleDateString()}` : '';
        const name = result.existingFilename || 'an earlier upload';
        return { ...line, status: 'duplicate', message: `Already uploaded as ${name}${when}`, at };
    }
    const other = result.sameFileInOtherYear;
    const note = other ? `Same file is also filed under ${other.taxYear} as ${other.filename}` : undefined;
    return { ...line, status: 'done', note, at };
}

const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({ clientUuid, onUploadComplete }) => {
    // Nothing is preselected on purpose: staff must choose the year for these
    // documents. The app never guesses it from today's date.
    const [taxYear, setTaxYear] = useState<number | ''>('');
    const thisYear = new Date().getFullYear();
    const taxYearOptions = Array.from({ length: TAX_YEAR_CHOICES }, (_, i) => thisYear - i);
    const yearChosen = taxYear !== '';

    const [isDragging, setIsDragging] = useState(false);
    const [lines, setLines] = useState<FileLine[]>([]);
    // Files started and files finished across all drops still in progress ("Uploading 2 of 5")
    const [progress, setProgress] = useState({ total: 0, completed: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const nextId = useRef(1);

    const working = progress.total > 0;

    // Ask the browser to confirm before closing or reloading the tab mid-upload
    useEffect(() => {
        if (!working) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [working]);

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(yearChosen);
        },
        [yearChosen]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const removeLine = useCallback((id: number) => {
        setLines((prev) => prev.filter((l) => l.id !== id));
    }, []);

    // "Clear all" removes every finished line (failures, duplicates and saved files)
    const clearAll = () => {
        setLines((prev) => prev.filter((l) => l.status === 'pending'));
    };

    const startUpload = useCallback(
        async (incoming: File[]) => {
            if (incoming.length === 0 || taxYear === '') return;

            const newLines: FileLine[] = incoming.map((file) => ({
                id: nextId.current++,
                name: file.name,
                status: 'pending',
                at: new Date(),
            }));
            setLines((prev) => [...prev, ...newLines]);
            setProgress((p) => ({ total: p.total + incoming.length, completed: p.completed }));

            await uploadDocuments(clientUuid, incoming, taxYear, (index, result) => {
                const id = newLines[index].id;
                setLines((prev) => prev.map((l) => (l.id === id ? applyResult(l, result) : l)));

                setProgress((p) => {
                    const completed = p.completed + 1;
                    return completed >= p.total ? { total: 0, completed: 0 } : { total: p.total, completed };
                });
            });

            onUploadComplete?.();
        },
        [clientUuid, taxYear, onUploadComplete]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (!yearChosen) return;
            const dropped = Array.from(e.dataTransfer.files);
            startUpload(dropped);
        },
        [startUpload, yearChosen]
    );

    const handleFileInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const selected = Array.from(e.target.files || []);
            startUpload(selected);
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        [startUpload]
    );

    const failed = lines.filter((l) => l.status === 'error').length;
    const duplicates = lines.filter((l) => l.status === 'duplicate').length;
    const saved = lines.filter((l) => l.status === 'done').length;
    const hasProblems = failed + duplicates > 0;

    // Saved lines stay while any failure or duplicate is on screen, so staff can see
    // which files went through. Once nothing needs attention, they clear after 10 seconds.
    useEffect(() => {
        if (working || hasProblems || saved === 0) return;
        const t = window.setTimeout(() => {
            setLines((prev) => prev.filter((l) => l.status !== 'done'));
        }, SUCCESS_LINE_MS);
        return () => window.clearTimeout(t);
    }, [working, hasProblems, saved]);

    return (
        <Box>
            <TextField
                select
                size="small"
                label="Tax year"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value === '' ? '' : Number(e.target.value))}
                helperText={yearChosen ? 'These files will be filed under this tax year' : 'Choose the tax year before adding files'}
                sx={{ mb: 2, minWidth: 220 }}
            >
                {taxYearOptions.map((year) => (
                    <MenuItem key={year} value={year}>
                        {year}
                    </MenuItem>
                ))}
            </TextField>

            {working && (
                <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 1 }}>
                    Uploading {Math.min(progress.completed + 1, progress.total)} of {progress.total}…
                </Alert>
            )}

            {hasProblems && (
                <Alert
                    severity={failed > 0 ? 'error' : 'warning'}
                    role="alert"
                    sx={{ mb: 1 }}
                    action={
                        <Button color="inherit" size="small" onClick={clearAll}>
                            Clear all
                        </Button>
                    }
                >
                    {summarizeOutcome(saved, failed, duplicates)}
                </Alert>
            )}

            {!working && !hasProblems && saved > 0 && (
                <Alert severity="success" sx={{ mb: 1 }}>
                    {summarizeOutcome(saved, 0, 0)}
                </Alert>
            )}

            <Paper
                variant="outlined"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => yearChosen && fileInputRef.current?.click()}
                aria-disabled={!yearChosen}
                sx={{
                    p: 4,
                    textAlign: 'center',
                    cursor: yearChosen ? 'pointer' : 'not-allowed',
                    opacity: yearChosen ? 1 : 0.55,
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    borderColor: isDragging ? 'primary.main' : 'divider',
                    backgroundColor: isDragging ? 'action.hover' : 'background.paper',
                    transition: 'background-color 0.15s, border-color 0.15s',
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={handleFileInputChange}
                />
                <CloudUpload sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body1" color="text.secondary">
                    {yearChosen ? 'Drag and drop files here, or click to browse' : 'Choose a tax year above to enable uploads'}
                </Typography>
            </Paper>

            {lines.length > 0 && (
                <List dense sx={{ mt: 2, maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                    {lines.map((line) => (
                        <ListItem
                            key={line.id}
                            secondaryAction={
                                line.status !== 'pending' && (
                                    <IconButton
                                        edge="end"
                                        size="small"
                                        aria-label={`Dismiss ${line.name}`}
                                        onClick={() => removeLine(line.id)}
                                    >
                                        <Close fontSize="small" />
                                    </IconButton>
                                )
                            }
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                {line.status === 'pending' ? (
                                    <CircularProgress size={20} />
                                ) : line.status === 'done' ? (
                                    <CheckCircle color="success" fontSize="small" />
                                ) : line.status === 'duplicate' ? (
                                    <ContentCopy color="warning" fontSize="small" />
                                ) : line.status === 'error' ? (
                                    <ErrorIcon color="error" fontSize="small" />
                                ) : (
                                    <InsertDriveFile fontSize="small" />
                                )}
                            </ListItemIcon>
                            <ListItemText
                                primary={line.name}
                                secondary={
                                    line.status === 'pending' ? (
                                        'Uploading…'
                                    ) : line.status === 'done' ? (
                                        <>
                                            Uploaded · {formatTime(line.at)}
                                            {line.note && (
                                                <Box component="span" sx={{ display: 'block', color: 'warning.dark' }}>
                                                    {line.note}
                                                </Box>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {line.message} · {formatTime(line.at)}
                                            {line.reference && (
                                                <Box component="span" sx={{ display: 'block' }}>
                                                    Reference: {line.reference}
                                                </Box>
                                            )}
                                        </>
                                    )
                                }
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
};

export default DocumentDropzone;
