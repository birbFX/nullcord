interface ImportMetaEnv {
    DEV: boolean;
    VITE_API_URL: string;
    VITE_THEMES_URL: string;
    VITE_ADMIN_URL?: string;
    BASE_URL: string;
}

interface ImportMeta {
    env: ImportMetaEnv;
}
