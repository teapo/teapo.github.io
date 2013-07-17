module teapo.fs {
  export interface FileSystem {
    nodes(searchPattern?: string): Node[];
  }

  export interface Node {
    path(): string;
	attributes(): Attributes;

	copy(newPath: string): void;
	move(newPath: string): void;
	remove(): void;
  }

  export enum Attributes {
    HIDDEN = 1,
	FILE = 2,
	DIRECTORY = 4,
	READONLY = 8,
	DELETED
  }

  export interface File extends Node {
  }

  export interface Directory extends Node {
    nodes(searchPattern?: string): Node[];
  }

  export function openFileSystem(name: string, callback: (error: Error, fs: FileSystem) => void): void {
    var fs = new RealFileSystem(name);
    callback(null, fs);
  }

  class RealFileSystem implements FileSystem {
    constructor(public name: string) {
    }
    nodes(searchPattern?: string): Node[] {
      throw new Error('Not implemented.');
    }
  }
}