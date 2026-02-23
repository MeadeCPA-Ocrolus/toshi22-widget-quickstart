/**
 * CategorySelector Component
 * 
 * Grouped dropdown for selecting Plaid categories.
 * Shows primary categories as group headers with detailed options.
 * 
 * @module Components/CategorySelector
 */

import React, { useState, useMemo } from 'react';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    ListSubheader,
    Box,
    Typography,
    TextField,
    InputAdornment,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { CATEGORY_GROUPS, CategoryOption } from '../constants/plaidCategories';

interface CategorySelectorProps {
    value: string | null;  // detailed category (raw format)
    onChange: (primary: string, detailed: string) => void;
    size?: 'small' | 'medium';
    fullWidth?: boolean;
    label?: string;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
    value,
    onChange,
    size = 'small',
    fullWidth = true,
    label = 'Category',
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Filter categories based on search
    const filteredGroups = useMemo(() => {
        if (!searchTerm) return CATEGORY_GROUPS;
        
        const term = searchTerm.toLowerCase();
        return CATEGORY_GROUPS.map(group => ({
            ...group,
            options: group.options.filter(opt =>
                opt.primaryDisplay.toLowerCase().includes(term) ||
                opt.detailedDisplay.toLowerCase().includes(term)
            ),
        })).filter(group => group.options.length > 0);
    }, [searchTerm]);

    const handleChange = (event: any) => {
        const detailed = event.target.value as string;
        // Find the category option to get the primary
        for (const group of CATEGORY_GROUPS) {
            const option = group.options.find(o => o.detailed === detailed);
            if (option) {
                onChange(option.primary, option.detailed);
                return;
            }
        }
    };

    // Build menu items with search and grouped headers
    const menuItems: React.ReactNode[] = [
        // Search field at top
        <ListSubheader key="search" sx={{ bgcolor: 'background.paper' }}>
            <TextField
                size="small"
                autoFocus
                placeholder="Search categories..."
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <Search fontSize="small" />
                        </InputAdornment>
                    ),
                }}
                sx={{ my: 1 }}
            />
        </ListSubheader>,
    ];

    // Add grouped options
    filteredGroups.forEach(group => {
        menuItems.push(
            <ListSubheader 
                key={`header-${group.primary}`}
                sx={{ 
                    bgcolor: 'grey.100', 
                    fontWeight: 700,
                    color: 'text.primary',
                    lineHeight: '32px',
                }}
            >
                {group.primaryDisplay}
            </ListSubheader>
        );
        
        group.options.forEach(option => {
            menuItems.push(
                <MenuItem 
                    key={option.detailed} 
                    value={option.detailed}
                    sx={{ pl: 4 }}
                >
                    {option.detailedDisplay}
                </MenuItem>
            );
        });
    });

    return (
        <FormControl size={size} fullWidth={fullWidth}>
            <InputLabel>{label}</InputLabel>
            <Select
                value={value || ''}
                onChange={handleChange}
                label={label}
                MenuProps={{
                    PaperProps: {
                        style: { maxHeight: 400 },
                    },
                    autoFocus: false,
                }}
            >
                {menuItems}
            </Select>
        </FormControl>
    );
};

export default CategorySelector;