module teapo.tscNode {

    export function install(fs?: any, logCallback?: (text: string, kind: string) => void) {
        return installCore(fs, logCallback);
    }

    var noneJustDelete = {};

    function installPolyfills(global, polyfills) {
        var saved: any = {};
        for (var k in polyfills) if (polyfills.hasOwnProperty(k)) {
            if (k in global)
                saved[k] = global[k];
            else
                saved[k] = noneJustDelete;
            global[k] = polyfills[k];
        }
        return saved;
    }

    function readFileSync(filename: string, fs: any) {
        if (!(filename in fs))
            return null;
        else
            return fs[filename];
    }

    function writeFileSync(filename: string, content: string, fs: any) {
        return fs[filename] = content;
    }

    function writeStdout(str: string, logCallback: (text: string, kind: string) => void) {
        if (logCallback)
            logCallback(str, 'stdout');
    }
    function writeStderr(str: string, logCallback: (text: string, kind: string) => void) {
        if (logCallback)
            logCallback(str, 'stderr');
    }

    var installed: boolean;
    function installCore(fs: any, logCallback: (text: string, kind: string) => void) {
        var global: any = (function() { return this; })() || window;

        var requireModules: any = {
            fs: {
                readFileSync: (filename) => readFileSync(filename, fs),
                writeFileSync: (filename, content) => writeFileSync(filename, content, fs)
            },
            path: { },
            os: {
                EOL: '\n'
            }
        };

        var saved = installPolyfills(global, {
            module: {
                exports: {}
            },
            process: {
                cwd: () => '/',
                argv: [ 'node', 'tsc.js' ],
                stdout: {
                    write: (str) => writeStdout(str, logCallback),
                    on: (eventName: string, callback) => {
                        if (eventName==='drain') {
                            callback();
                        }
                    }
                },
                stderr: {
                    write: (str) => writeStderr(str, logCallback),
                    on: (eventName: string, callback) => {
                        if (eventName==='drain') {
                            callback();
                        }
                    }
                },
                exit: (exitCode) => {
                    if (installed) // do not throw at the first dummy run: nobody is catching
                        return;
                    throw new Error('process.exit('+exitCode+')');
                }
            },
            require: (moduleName: string) => requireModules[moduleName]
        });

        installed = true;
        return () => uninstall(saved, global);
    }
    
    function uninstall(saved, global) {
        installed = false;
        for (var k in saved) if (saved.hasOwnProperty(k)) {
            var savedValue = saved[k];
            if (savedValue === noneJustDelete)
                delete global[k];
            else
                global[k] = saved;
        }
    }
}