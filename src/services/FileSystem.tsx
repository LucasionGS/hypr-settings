import { invoke } from "@tauri-apps/api/core"
import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface IFSEntry {
  name: string;
  size: number;
  modified: string;
  is_file: boolean;
  is_dir: boolean;
}

interface FileSystemContextType {
  currentDirectory: string;
  currentFiles: IFSEntry[];
  isLoading: boolean;
  error: string | null;
  readDirectory: (path?: string) => Promise<IFSEntry[]>;
  changeDirectory: (newPath: string) => Promise<void>;
  setCurrentDirectory: (path: string) => void;
  startFileDrag: (filePath: string) => Promise<void>;
  prepareFileForDrag: (filePath: string) => Promise<void>;
}

const FileSystemContext = createContext<FileSystemContextType | undefined>(undefined);

interface FileSystemProviderProps {
  children: ReactNode;
  initialDirectory?: string;
}

export function FileSystemProvider({ children, initialDirectory = "." }: FileSystemProviderProps) {
  const [currentDirectory, setCurrentDirectory] = useState<string>(initialDirectory);
  const [currentFiles, setCurrentFiles] = useState<IFSEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const readDirectory = useCallback(async (path?: string) => {
    const targetPath = path || currentDirectory;
    setIsLoading(true);
    setError(null);
    
    try {
      const files = await invoke<IFSEntry[]>("read_directory", { path: targetPath });
      setCurrentFiles(files);
      if (path) {
        setCurrentDirectory(path);
      }
      return files;
    } catch (err: any) {
      console.error("Error reading directory:", err);
      setError(err.message || "Failed to read directory");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentDirectory]);

  const changeDirectory = useCallback(async (newPath: string) => {
    await readDirectory(newPath);
  }, [readDirectory]);

  const startFileDrag = useCallback(async (filePath: string) => {
    try {
      await invoke("start_file_drag", { filePath });
    } catch (err: any) {
      console.error("Error starting file drag:", err);
      setError(err.message || "Failed to start file drag");
      throw err;
    }
  }, []);

  const prepareFileForDrag = useCallback(async (filePath: string) => {
    try {
      await invoke("prepare_file_for_drag", { filePath });
    } catch (err: any) {
      console.error("Error preparing file for drag:", err);
      setError(err.message || "Failed to prepare file for drag");
      throw err;
    }
  }, []);

  useEffect(() => {
    // Initial read of the directory when the provider mounts
    readDirectory(initialDirectory).catch(err => {
      console.error("Failed to read initial directory:", err);
      setError(err.message || "Failed to read initial directory");
    });
  }, [initialDirectory]);

  const value = {
    currentDirectory,
    currentFiles,
    isLoading,
    error,
    readDirectory,
    changeDirectory,
    setCurrentDirectory,
    startFileDrag,
    prepareFileForDrag
  };

  return (
    <FileSystemContext.Provider value={value}>
      {children}
    </FileSystemContext.Provider>
  );
}

export function useFileSystem() {
  const context = useContext(FileSystemContext);
  if (context === undefined) {
    throw new Error('useFileSystem must be used within a FileSystemProvider');
  }
  return context;
}