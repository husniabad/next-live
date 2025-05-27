export const sanitizeForSubdomain = (str: string, maxLength: number = 20): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/\s+/g, '-')      // Replace spaces with hyphens
        .replace(/[^a-z0-9-]/g, '') // Remove special characters except hyphens
        .replace(/-+/g, '-')       // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, '')   // Trim leading/trailing hyphens
        .substring(0, maxLength);
};