/// <reference path='typings/typescriptServices.d.ts' />
/// <reference path='typings/codemirror.d.ts' />

module teapo.core {

    class DocScript {
        version = 1;
        contentLength = 0;
        
        private _editRanges: { length: number; textChangeRange: TypeScript.TextChangeRange; }[] = [];
        private _earlyChange: { from: number; to: number; } = null;

        constructor(public path: string, public doc: CodeMirror.Doc) {
            CodeMirror.on(this.doc, 'beforeChange', (doc, change) => this._docBeforeChanged(change));
            CodeMirror.on(this.doc, 'change', (doc, change) => this._docChanged(change));
        }

        createSnapshot() {
            return new DocScriptSnapshot(this.doc, this, this.version);
        }
    
        getTextChangeRangeBetweenVersions(startVersion:number, endVersion: number) {
            if (startVersion === endVersion)
                return TypeScript.TextChangeRange.unchanged;
    
            var initialEditRangeIndex = this._editRanges.length - (this.version - startVersion);
            var lastEditRangeIndex = this._editRanges.length - (this.version - endVersion);
    
            var entries = this._editRanges.slice(initialEditRangeIndex, lastEditRangeIndex);
            return TypeScript.TextChangeRange.collapseChangesAcrossMultipleVersions(entries.map(e => e.textChangeRange));
        }
    
        private _docBeforeChanged(change: CodeMirror.EditorChange) {
            var from = this.doc.indexFromPos(change.from);
            var to = this.doc.indexFromPos(change.to);
            
            this._earlyChange = { from: from, to: to };
        }
    
        private _docChanged(change: CodeMirror.EditorChange) {
            if (!this._earlyChange)
                return;
    
            var newFromPosition = change.from;
            var newToPosition = !change.text || change.text.length === 0 ? change.from : {
                line: change.from.line + change.text.length,
                ch: (change.to.line == change.from.line ? change.from.ch : 0) + change.text[change.text.length - 1].length
            };
    
            var newLength = this.doc.indexFromPos(newToPosition) - this.doc.indexFromPos(newFromPosition);
    
            if ('console' in window) {
                console.log(
                    '_editContent('+
                        this._earlyChange.from+', '+
                        this._earlyChange.to+', '+
                        (newLength - (this._earlyChange.to - this._earlyChange.from))+
                    ') /*'+change.text+'*/');
            }
                
            this._editContent(this._earlyChange.from, this._earlyChange.to, newLength);
    
            this._earlyChange = null;
        }
    
        private _editContent(start: number, end: number, newLength: number) {
            this.contentLength += end - start + newLength;
            
            var newSpan = TypeScript.TextSpan.fromBounds(start, end);
            
            // Store edit range + new length of script
            var textChangeRange = new TypeScript.TextChangeRange(
                newSpan,
                newLength);
    
            this._editRanges.push({
                length: this.contentLength,
                textChangeRange: textChangeRange
            });
    
            // Update version #
            this.version++;
        }
    }
    
    class DocScriptSnapshot implements TypeScript.IScriptSnapshot {
        constructor(
            private _doc: CodeMirror.Doc,
            private _script: {
                getTextChangeRangeBetweenVersions(scriptVersion: number, version: number): TypeScript.TextChangeRange;
            },
            private _version: number) {
        }
        
        getText(start: number, end: number): string {
            var startPos = this._doc.posFromIndex(start);
            var endPos = this._doc.posFromIndex(end);
            var text = this._doc.getRange(startPos, endPos);
            return text;
        }
    
    	getLength(): number {
    		return this._doc.getValue().length;
    	}
    
    	getLineStartPositions(): number[]{
    		var result: number[] = [];
    		var pos: CodeMirror.Pos = {
    			line: 0,
    			ch: 0
    		};
    
    		this._doc.eachLine((line) => {
    			pos.line = result.length;
    			var lineStartPosition = this._doc.indexFromPos(pos);
    			result.push(lineStartPosition);
    		} );
    		return result;
    	}
    
    	getTextChangeRangeSinceVersion(scriptVersion: number): TypeScript.TextChangeRange {
    		var range = this._script.getTextChangeRangeBetweenVersions(scriptVersion, this._version);
    		return range;
    	}
    }

    class LanguageServiceHost implements Services.ILanguageServiceHost {
        compilationSettings = new TypeScript.CompilationSettings();
        logOutput: { text: string; level: string; }[] = [];

        private _diagnostics: Services.ILanguageServicesDiagnostics = null;
        private _lastLogFlagRequest: string = null;
        
        constructor(private _fileSystem: TSFileSystem) {
        }

        // ILanguageServiceHost
        
        getScriptByteOrderMark(fileName: string): ByteOrderMark {
            return ByteOrderMark.None;
        }

        getCompilationSettings(): TypeScript.CompilationSettings { return this.compilationSettings; }

        getScriptFileNames(): string[] {
            var result: string[] = [];
            for (var k in this._fileSystem.scripts) if (this._fileSystem.scripts.hasOwnProperty(k)) {
                var file = this._fileSystem.scripts[k];
                if (file)
                    result.push(file.path);
            }
            return result;
        }

        getScriptVersion(fileName: string): number {
            var script = this._fileSystem.scripts[fileName];
            if (!(script instanceof DocScript))
                throw new Error('File not found.');

            return script.version;
        }

        getScriptIsOpen(fileName: string): boolean {
            // TODO: figure out whatever that flag means
            return false;
        }

        getScriptSnapshot(fileName: string): TypeScript.IScriptSnapshot {
            var script = this._fileSystem.scripts[fileName];
            if (!(script instanceof DocScript))
                throw new Error('File not found.');

            return script.createSnapshot();
        }

        getDiagnosticsObject(): Services.ILanguageServicesDiagnostics {
            if (!this._diagnostics)
                this._diagnostics = { log: (content: string) => this._diagnosticsLog(content) };
            return this._diagnostics;
        }

        // ILogger

        information(): boolean {
            this._lastLogFlagRequest = 'information';
            return this._fileSystem.logLevels.information;
        }

        debug(): boolean {
            this._lastLogFlagRequest = 'debug';
            return this._fileSystem.logLevels.debug;
        }

        warning(): boolean {
            this._lastLogFlagRequest = 'warning';
            return this._fileSystem.logLevels.warning;
        }

        error(): boolean {
            this._lastLogFlagRequest = 'error';
            return this._fileSystem.logLevels.error;
        }

        fatal(): boolean {
            this._lastLogFlagRequest = 'fatal';
            return this._fileSystem.logLevels.fatal;
        }

        log(s: string): void {
            this.logOutput.push({
                text: s,
                level: this._lastLogFlagRequest
            });
        }

        // IReferenceResolveHost

        // implemented above as part of ILanguageHost
        // getScriptSnapshot(fileName: string): TypeScript.IScriptSnapshot

        resolveRelativePath(path: string, directory: string): string {
            if (!path)
                return directory;
            if (!directory)
                return path;

            // TODO: find out whether that's the right direction, also whether .. needs to be parsed
            if (directory.charAt(0)=='/')
                return path + directory;
            else
                return path + '/' + directory;
        }

        fileExists(path: string): boolean {
            var allScriptsNames = this._fileSystem.scriptNames();
            for (var i = 0; i < allScriptsNames.length; i++) {
                if (allScriptsNames[i]===path)
                    return true;
            }
            return false;
        }

        directoryExists(path: string): boolean {
            var pattern = path;
            if (pattern.charAt(0)!=='/')
                pattern = '/'+pattern;
            if (pattern.charAt(pattern.length-1)!=='/')
                pattern = pattern+'/';

            // we only store files, no directories
            // -- so we need to look for files starting with '/directory/'
            var allScriptsNames = this._fileSystem.scriptNames();
            for (var i = 0; i < allScriptsNames.length; i++) {
                var fn = allScriptsNames[i];
                if (fn.length<pattern.length)
                    continue;
                if (fn.substring(0,pattern.length)===pattern)
                    return true;
            }
            return false;
        }

        getParentDirectory(path: string): string {
            var lastSlash = path.lastIndexOf('/');
            if (lastSlash===path.length-1)
                lastSlash = path.lastIndexOf('/', lastSlash-1);
            if (lastSlash <= 0)
                return '/';
            else
                return path.substr(0, lastSlash);
        }

        
        private _diagnosticsLog(s: string): void {
            this.logOutput.push({
                text: s,
                level: 'diagnostics'
            });
        }
    }

	class TSFileSystem {
        private _host: LanguageServiceHost;

    	typescript: Services.ILanguageService;

        scripts: { [filename: string]: DocScript; } = {};
        logLevels = {
            information: true,
            debug: true,
            warning: true,
            error: true,
            fatal: true
        };

		constructor() {
            this._host = new LanguageServiceHost(this);
            var factory = new Services.TypeScriptServicesFactory();
            this.typescript = factory.createPullLanguageService(this._host);
		}

        createScript(filename: string, content: string): DocScript {
            if (!filename
                || typeof filename !== 'string'
                || filename.charAt(0) !== '/')
                throw new Error('Absolute filename starting with back slash expected.');

            if (this.scripts[filename])
                throw new Error('File already exists.');

            var doc = new CodeMirror.Doc(content);
            var script = new DocScript(filename, doc);

            this.scripts[filename] = script;

            return script;
        }

        scriptNames(): string[] {
            var result: string[] = [];
            for (var k in this.scripts) if (this.scripts.hasOwnProperty(k)) {
                var s = this.scripts[k];
                if (s instanceof DocScript)
                    result.push(s.path);
            }
            return result;
        }
    }
    
    export class FileSystem {
        private _fs: TSFileSystem;
        typescript: Services.ILanguageService;

        onchange: () => void = null;

        constructor() {
            this._fs = new TSFileSystem();
            this.typescript = this._fs.typescript;
        }

        createScript(filename: string, content: string): CodeMirror.Doc {
            var script = this._fs.createScript(filename, content);

            CodeMirror.on(script.doc, 'change', <any>(() =>
                {
                    this.onchange();
                }));

            return script.doc;
        }

        scriptNames(): string[] {
            return this._fs.scriptNames();
        }

        getScript(filename: string): CodeMirror.Doc {
            var script = this._fs.scripts[filename];
            if (script instanceof DocScript)
                return script.doc;
            else
                throw new Error('File not found.');
        }
    }
}