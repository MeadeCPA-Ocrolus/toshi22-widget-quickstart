import React, { useState, useCallback, useRef } from 'react';
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
import { uploadDocuments } from '../services/documents-api';

interface DocumentDropzoneProps {
    /** The client's UUID — never pass the internal client_id here */
    clientUuid: string;
    /** Called after each upload batch completes, so the parent can refresh its document list */
    onUploadComplete?: () => void;
}

interface FileStatus {
    file: File;
    status: 'pending' | 'uploading' | 'done' | 'duplicate' | 'error';
    error?: string;
}

/** How many tax years the dropdown offers, counting back from this year. */
const TAX_YEAR_CHOICES = 11;

const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({ clientUuid, onUploadComplete }) => {
    // Nothing is preselected on purpose: staff must choose the year for these
    // documents. The app never guesses it from today's date.
    const [taxYear, setTaxYear] = useState<number | ''>('');
    const thisYear = new Date().getFullYear();
    const taxYearOptions = Array.from({ length: TAX_YEAR_CHOICES }, (_, i) => thisYear - i);
    const yearChosen = taxYear !== '';
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<FileStatus[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(yearChosen);
    }, [yearChosen]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const startUpload = useCallback(
        async (incoming: File[]) => {
            if (incoming.length === 0 || taxYear === '') return;

            const pending: FileStatus[] = incoming.map((file) => ({ file, status: 'pending' }));
            setFiles((prev) => [...prev, ...pending]);
            setIsUploading(true);

            const results = await uploadDocuments(clientUuid, incoming, taxYear);

            setFiles((prev) => {
                const updated = [...prev];
                results.forEach((result, i) => {
                    const targetFile = incoming[i];
                    const idx = updated.findIndex((f) => f.file === targetFile);
                    if (idx === -1) return;

                    if ('error' in result) {
                        updated[idx] = { ...updated[idx], status: 'error', error: result.error };
                    } else if (result.duplicate) {
                        updated[idx] = { ...updated[idx], status: 'duplicate' };
                    } else {
                        updated[idx] = { ...updated[idx], status: 'done' };
                    }
                });
                return updated;
            });

            setIsUploading(false);
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

    const removeFile = (file: File) => {
        setFiles((prev) => prev.filter((f) => f.file !== file));
    };

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

            {files.length > 0 && (
                <List dense sx={{ mt: 2 }}>
                    {files.map((f, i) => (
                        <ListItem
                            key={`${f.file.name}-${i}`}
                            secondaryAction={
                                f.status !== 'uploading' && (
                                    <IconButton edge="end" size="small" onClick={() => removeFile(f.file)}>
                                        <Close fontSize="small" />
                                    </IconButton>
                                )
                            }
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                {f.status === 'pending' || f.status === 'uploading' ? (
                                    <CircularProgress size={20} />
                                ) : f.status === 'done' ? (
                                    <CheckCircle color="success" fontSize="small" />
                                ) : f.status === 'duplicate' ? (
                                    <ContentCopy color="warning" fontSize="small" />
                                ) : f.status === 'error' ? (
                                    <ErrorIcon color="error" fontSize="small" />
                                ) : (
                                    <InsertDriveFile fontSize="small" />
                                )}
                            </ListItemIcon>
                            <ListItemText
                                primary={f.file.name}
                                secondary={
                                    f.status === 'duplicate'
                                        ? 'Already uploaded for this client/year'
                                        : f.status === 'error'
                                        ? f.error
                                        : f.status === 'done'
                                        ? 'Uploaded'
                                        : 'Uploading…'
                                }
                            />
                        </ListItem>
                    ))}
                </List>
            )}

            {isUploading && (
                <Alert severity="info" sx={{ mt: 1 }}>
                    Uploading — please don't close this page.
                </Alert>
            )}
        </Box>
    );
};

export default DocumentDropzone;