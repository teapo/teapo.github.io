/// <reference path='typings/codemirror.d.ts' />
/// <reference path='typings/codemirror.show-hint.d.ts' />
/// <reference path='layout.ts' />
/// <reference path='core.ts' />
/// <reference path='fs.ts' />
/// <reference path='tscNode.ts' />

module teapo {
    export class Editor {
        private _fs = new teapo.core.FileSystem();
        private _editor: CodeMirror.Editor;

        private _selectedFileName: string = null;

        private _emptyDoc = new CodeMirror.Doc('');

        private _completionDelay = null;

        private _newFilename: HTMLInputElement = null;
        private _newFileButton: HTMLButtonElement = null;
        private _isEnteringNewFilename: boolean = false;

        constructor(
            private _toolbar: HTMLElement,
            private _navigator: HTMLElement,
            private _content: HTMLElement) {
            this._editor = CodeMirror(this._content, {
                mode: "text/typescript",//here
                matchBrackets: true,
                continueComments: "Enter",
                autoCloseBrackets: true,
                lineNumbers: true,
                autofocus: true,
                styleActiveLine: true,
                matchBrackets: true,
                showTrailingSpace: true,
                // indentWithTabs: true,
                continueComments: "Enter",
                extraKeys: {
                    'Ctrl-Space': () => this._triggerCompletion('Ctrl-Space')
                }
            });
            this._editor.on('change', (instance, changeList: CodeMirror.EditorChangeLinkedList) => {
                if (!changeList.text
                    || changeList.text.length==0
                    || changeList.next)
                    return;

                if (changeList.text[0]==='.'
                    || changeList.text[0]==='. '
                    || changeList.text[0]==='('
                    || changeList.text[0]==='.'
                    || changeList.text[0]==='=')
                    this._triggerCompletion(changeList.text[0]);
            });

            var savedState = this._retrieveSavedState();
            if (savedState) {
                for (var f in savedState) if (savedState.hasOwnProperty(f)) {
                    if (f.charAt(0)==='/') {
                        this._fs.createScript(f, savedState[f]);
                    }

                    if (f==='selected') {
                        this._selectedFileName = savedState[f];
                    }
                }
            }

            this._updateToolbar();
            this._updateNavigator();
            this._processNavigatorSelection();

            var autosaveTimeout = null;
            this._fs.onchange = () => {
                if (autosaveTimeout)
                    clearTimeout(autosaveTimeout);
                autosaveTimeout = setTimeout(() => {
                    autosaveTimeout = null;
                    this._saveState();
                }, 1000);
            };
        }

        private _updateToolbar() {
            if (!this._newFilename) {
                this._newFilename = document.createElement('input');
                this._newFilename.style.display = 'none';
                this._newFilename.onkeydown = (e) => this._onNewFilenameKey(e || window.event);
                this._newFilename.onblur = () => this._onNewFilenameBlur();
                this._toolbar.appendChild(this._newFilename);
            }
            if (!this._newFileButton) {
                this._newFileButton = document.createElement('button');
                var newFileText = '/new file...';
                if ('textContent' in this._newFileButton)
                    this._newFileButton.textContent = newFileText;
                else if ('innerText' in this._newFileButton)
                    this._newFileButton.innerText = newFileText;
                this._newFileButton.onclick = () => this._onNewFileClick();
                this._toolbar.appendChild(this._newFileButton);
            }
        }

        private _onNewFileClick() {
            this._newFileButton.style.display = 'none';
            this._newFilename.style.display = 'block';
            this._newFilename.value = '/';
            this._newFilename.focus();
            this._newFilename.selectionStart = this._newFilename.value.length;
        }

        private _onNewFilenameKey(e: KeyboardEvent) {
            if (e.keyCode===13) {
                try {
                    this._addFile(this._newFilename.value);
                }
                catch (error) {
                    alert(error.message);
                    return;
                }

                this._newFileButton.style.display = 'block';
                this._newFilename.style.display = 'none';
                if ('cancelBubble' in e)
                    e.cancelBubble = true;
            }
            else if (e.keyCode===27) {
                this._cancelNewFilename();
            }
        }

        private _onNewFilenameBlur() {
            this._cancelNewFilename();
        }

        private _cancelNewFilename() {
            if (this._newFilename.style.display!=='block'
                || this._newFileButton.style.display==='none')
                return;
            this._newFileButton.style.display = 'block';
            this._newFilename.style.display = 'none';
        }

        private _addFile(filename: string) {
            this._fs.createScript(filename, '');
            this._selectedFileName = filename;
            this._updateNavigator();
            this._processNavigatorSelection();
            this._editor.focus();
        }

        private _setEditingNewFilename(isEditing: boolean) {
            if (this._isEnteringNewFilename) {
                this._newFilename.style.display = 'block';
            }
            else {
                this._newFilename.style.display = 'none';
            }
        }

        private _updateNavigator() {
            this._navigator.innerHTML = '';
            this._navigator.textContent = '';
            var orderedScripts = this._fs.scriptNames();
            orderedScripts.sort();
            for (var i = 0; i < orderedScripts.length; i++) {
                var filename = orderedScripts[i];

                var scriptElement = this._createNavigatorScriptElement(filename);

                this._navigator.appendChild(scriptElement);
            }
        }

        private _createNavigatorScriptElement(filename: string) {
            var scriptElement = document.createElement('pre');
            scriptElement.className = 'teapo-navigator-script';
            if (this._selectedFileName === filename)
                scriptElement.className += ' teapo-navigator-script-selected';

            if ('textContent' in scriptElement)
                scriptElement.textContent = filename;
            else if ('innerText' in scriptElement)
                scriptElement.innerText = filename;

            scriptElement.onclick = () => this._navigatorScriptClicked(filename);

            return scriptElement;
        }

        private _navigatorScriptClicked(filename: string) {
            this._selectedFileName = filename;
            this._updateNavigator();
            this._processNavigatorSelection();
            this._editor.focus();
        }

        private _processNavigatorSelection() {
            if (this._selectedFileName) {
                this._editor.setOption('readOnly', false);
                var script = this._fs.getScript(this._selectedFileName);
                this._editor.swapDoc(script);
                this._editor.setOption('mode', 'text/typescript');
            }
            else {
                this._editor.swapDoc(this._emptyDoc);
                this._editor.setOption('readOnly', true);
            }
        }

        private _retrieveStateFromHtml() {
            var result: any = {};
            for (var i = 0; i < document.scripts.length; i++) {
                var script = <HTMLScriptElement>document.scripts[i];

                var filename = script.title || script.getAttribute('title');
                if (!filename)
                    continue;

                var content: string;
                if ('text' in script)
                    content = script.text;
                else if ('textContent' in script)
                    content = script.textContent;
                else if ('innerText' in script)
                    content = script.innerText;

                if (content===null)
                    continue;

                result[filename] = content;
            }
            return result;
        }

        private _getLocalStorageKey() {
            var stateKey = 'teapoState';
            if (location.hash)
                stateKey += '@'+location.href.substr(0, location.href.length - location.hash.length);
            else
                stateKey = '@'+location.href;
            return stateKey;
        }

        private _retrieveStateFromLocalStorage() {

            var result: any = {};
            if ('JSON' in window
                && 'localStorage' in window) {
                try {
                    result = JSON.parse(localStorage[this._getLocalStorageKey()]);
                }
                catch (error) { }
            }
            return result;            
        }
        
        private _retrieveSavedState() {
            var htmlState = this._retrieveStateFromHtml();
            var localStorageState = this._retrieveStateFromLocalStorage();

            if (htmlState===null)
                return localStorageState;
            if (localStorageState===null)
                return htmlState;

            var htmlStateSaved = htmlState.saved;
            if (htmlStateSaved) {
                try {
                    htmlStateSaved = Date.parse(htmlStateSaved);
                }
                catch (error) { }
            }

            var localStorageStateSaved = localStorageState.saved;
            if (localStorageStateSaved) {
                try {
                    localStorageStateSaved = Date.parse(localStorageStateSaved);
                }
                catch (error) { }
            }
            
            if (htmlStateSaved < localStorageStateSaved)
                return localStorageState;
            else
                return htmlState;
        }

        private _saveState() {
            this._saveStateToLocalStorage();
            this._saveStateToHtml();
        }

        private _saveStateToHtml() {

            // remove all scripts that are part of the state
            var removeScripts = [];
            for (var i = 0; i < document.scripts.length; i++) {
                var s = <HTMLScriptElement>document.scripts[i];
                if (s.title)
                    removeScripts.push(s);
            }
            for (var i = 0; i < removeScripts.length; i++) {
                if ('head' in document)
                    document.head.removeChild(removeScripts[i]);
                else
                    document.getElementsByTagName('head')[0].removeChild(removeScripts[i]);
            }

            var scriptFilenames = this._fs.scriptNames();
            for (var i = 0; i < scriptFilenames.length; i++) {
                var fn = scriptFilenames[i];
                var doc = this._fs.getScript(fn);
                
                this._addScript(fn, doc.getValue());
            }
            
            this._addScript(
                'saved',
                new Date().toUTCString());
            this._addScript(
                'selected',
                this._selectedFileName);
        }

        private _addScript(title: string, content: string) {
            var persistenceScriptType = 'save';
            var scriptElement = document.createElement('script');

            if ('title' in scriptElement)
                scriptElement.title = title;
            else if (scriptElement.setAttribute)
                scriptElement.setAttribute('title', title);

            if ('type' in scriptElement)
                scriptElement.type = persistenceScriptType;
            else if (scriptElement.setAttribute)
                scriptElement.setAttribute('type', persistenceScriptType);

            if ('text' in scriptElement)
                scriptElement.text = title;
            else if ('textContent' in scriptElement)
                scriptElement.textContent = title;
            else if ('innerText' in scriptElement)
                scriptElement.innerText = title;

            if (document.head)
                document.head.appendChild(scriptElement);
            else
                document.getElementsByTagName('head')[0].appendChild(scriptElement);

            return scriptElement;
        }

        private _saveStateToLocalStorage() {
            if (!window.localStorage || !window['JSON'])
                return;

            var state: any = {
                saved: new Date().toUTCString(),
                selected: this._selectedFileName
            };

            var scripts = this._fs.scriptNames();
            for (var i = 0; i < scripts.length; i++) {
                var s = scripts[i];
                var doc = this._fs.getScript(s);
                state[s] = doc.getValue();
            }

            localStorage[this._getLocalStorageKey()] = JSON.stringify(state);
        }

        private _debugDump;
        private _triggerCompletion(key: string) {
            if (!this._debugDump) {
                this._debugDump = document.createElement('span');
                this._toolbar.appendChild(this._debugDump);
            }
            this._debugDump.textContent = '['+key+'] '+this._debugDump.textContent;
            
            if (this._completionDelay)
                clearTimeout(this._completionDelay);

            this._completionDelay = setTimeout(() => {
                this._completionDelay = null;
                this._performCompletion(key);
            }, 100);

            return CodeMirror.Pass;
        }

        private _performCompletion(key: string) {
            // keeping the list
            var completions = this._getFullCompletionObject();
            if (!completions)
                return;

            CodeMirror.showHint(
                this._editor,
                () => {
                    var doc = this._editor.getDoc();
                    var cursorPos = doc.getCursor();

                    var result = [];
                    var wp = this._getWordAndPrefix(doc, cursorPos);
                    for (var i = 0; i < completions.length; i++) {
                        var cm = completions[i];
                        var tsco = cm.tsco;
                        // filter out those not matching the start of the word
                        if (tsco.name.length<wp.prefix.length
                            || tsco.name.substring(0, wp.prefix.length).toLowerCase()!==wp.prefix.toLowerCase())
                            continue;
                        result.push(cm);
                        
                        if (result.length>30) {
                            result.push({
                                displayText: '...continue typing for more...',
                                text: ''
                            });
                            break;
                        }
                    }

                    var from = {
                        ch: cursorPos.ch - wp.prefix.length,
                        line: cursorPos.line
                    };

                    var to = {
                        ch: from.ch + wp.word.length,
                        line: cursorPos.line
                    };

                    return {
                        list: result,
                        from: from,
                        to: to
                    };
                });
        }

        private _getFullCompletionObject() {
            var doc = this._editor.getDoc();
            var cursorPos = doc.getCursor();

            var cursorOffset = doc.indexFromPos(cursorPos);

            var tsCompletions = this._getTypeScriptCompletions(this._selectedFileName, cursorOffset);
            var cmCompletions = this._getCodeMirrorCompletions(doc, this._selectedFileName, cursorPos, cursorOffset, tsCompletions);
            
            return cmCompletions;
        }
    
        private _getTypeScriptCompletions(filename: string, cursorOffset: number) {
            var completions = this._fs.typescript.getCompletionsAtPosition(filename, cursorOffset, true);
            return completions;
        }
        
        private _getCodeMirrorCompletions(
            doc: CodeMirror.Doc, filename: string,
            cursorPos: CodeMirror.Pos, cursorOffset: number,
            tsCompletions: Services.CompletionInfo) {

            if (!tsCompletions || !tsCompletions.entries.length)
                return null;
                
            var wp = this._getWordAndPrefix(doc, cursorPos);
                
            var cmCompletions = [];
            var added: any = {};
            for (var i = 0; i < tsCompletions.entries.length; i++) {
                var tsco = tsCompletions.entries[i];
    
                if (added[tsco.name])
                    continue;

                if (tsco.kind==='keyword'
                    || tsco.name==='undefined' || tsco.name==='null')
                    continue;

                //console.log(tsco);
                added[tsco.name] = true;

                cmCompletions.push({
                    displayText: tsco.name, // + (tsco.docComment ? ' /** '+tsco.docComment+'*/':''),
                    text: tsco.name,
                    tsco: tsco,
                    index: i,
                    tscoDetails: null,
                    render: (elt: HTMLElement, data: any, completion: { 
                        index: number;
                        tscoDetails: Services.CompletionEntryDetails;
                        tsco: Services.CompletionEntry }) => {

                        var tsco = completion.tsco;
                        var tscoDetails = completion.tscoDetails || this._fs.typescript.getCompletionEntryDetails(
                            filename, cursorOffset,
                            tsco.name);

                        if ('textContent' in elt)
                            elt.textContent = tsco.name;
                        else
                            elt.innerText = tsco.name;

                        if (tscoDetails.docComment) {
                            var commentSpan = document.createElement('span');
                            if ('textContent'  in commentSpan)
                                commentSpan.textContent = ' //'+tscoDetails.docComment;
                            else
                                commentSpan.innerText = ' //'+tscoDetails.docComment;
                            commentSpan.style.opacity = '0.5';
                            elt.appendChild(commentSpan);
                        }                        
                    }
                })
            }

            return cmCompletions;
        }
        
        private _getWordAndPrefix(doc: CodeMirror.Doc, cursorPos: CodeMirror.Pos) {
            var lineText = doc.getLine(cursorPos.line);
            
            var prefix = '';
            for (var i = cursorPos.ch-1; i>=0; i--) {
                var c = lineText[i];
                if (this._isWordChar(c)) {
                    prefix = c + prefix;
                }
                else {
                    break;
                }        
            }
            
            var word = prefix;
            for (var i = cursorPos.ch; i<lineText.length; i++) {
                var c = lineText[i];
                if (this._isWordChar(c)) {
                    word += c;
                }
                else {
                    break;
                }        
            }
            
            return {word: word, prefix: prefix};
        }

        private _isWordChar(c: string): boolean {
            return (
                (c==='_')
                || (c==='$')
                || (c>='0' && c<='9')
                || (c>='a' && c<='z')
                || (c>='A' && c<='Z'));
        }

    }
}