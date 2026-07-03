(function()
{
    if (!window.DRAWIO_DOCKER_FILE_STORAGE_ENABLED ||
        typeof EditorUi === 'undefined' || typeof DrawioFile === 'undefined')
    {
        return;
    }

    var api = 'docker-storage.jsp';
    var installed = false;
    var dockerHashPrefix = 'DX';
    var dockerMode = 'docker';

    function dirname(path)
    {
        var index = (path || '').lastIndexOf('/');
        return index >= 0 ? path.substring(0, index) : '';
    }

    function basename(path)
    {
        var parts = (path || '').split('/');
        return parts[parts.length - 1] || 'diagram.drawio';
    }

    function ensureExtension(path)
    {
        if (!path)
        {
            return path;
        }

        return /\.[^\/.]+$/i.test(basename(path)) ? path : path + '.drawio';
    }

    function isDiagramPath(path)
    {
        return /(\.drawio|\.xml)$/i.test(path || '');
    }

    function isDockerOpenablePath(path)
    {
        return /(\.drawio|\.xml|\.png)$/i.test(path || '');
    }

    function getExtension(path)
    {
        var name = basename(path);
        var index = name.lastIndexOf('.');
        return index >= 0 ? name.substring(index + 1).toLowerCase() : '';
    }

    function getMimeType(path)
    {
        var ext = getExtension(path);

        if (ext === 'png')
        {
            return 'image/png';
        }
        else if (ext === 'svg')
        {
            return 'image/svg+xml';
        }
        else if (ext === 'html' || ext === 'htm')
        {
            return 'text/html';
        }

        return 'text/xml';
    }

    function getDataForPath(ui, path)
    {
        return ui.getFileData(/(\.xml)$/i.test(path) || path.indexOf('.') < 0 ||
            /(\.drawio)$/i.test(path), /(\.svg)$/i.test(path), /(\.html)$/i.test(path));
    }

    function request(action, path, options)
    {
        options = options || {};
        var url = api + '?action=' + encodeURIComponent(action) +
            '&path=' + encodeURIComponent(path || '');

        if (options.params != null)
        {
            for (var key in options.params)
            {
                url += '&' + encodeURIComponent(key) + '=' +
                    encodeURIComponent(options.params[key]);
            }
        }

        return fetch(url, {
            method: options.method || 'GET',
            credentials: 'same-origin',
            headers: options.headers || {},
            body: options.body
        }).then(function(resp)
        {
            if (!resp.ok)
            {
                return resp.text().then(function(text)
                {
                    throw new Error(text || resp.statusText);
                });
            }

            return options.text ? resp.text() : resp.json();
        });
    }

    function saveBase64ToDocker(ui, path, data, success, error)
    {
        request('save', path, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain;charset=UTF-8'},
            params: {encoding: 'base64'},
            body: data
        }).then(function()
        {
            if (success != null)
            {
                success();
            }

            ui.updateStatus(function()
            {
                ui.editor.setStatus('Saved to Docker Files: ' + path);
            });
        }).catch(function(err)
        {
            if (error != null)
            {
                error(err);
            }
            else
            {
                ui.handleError(err);
            }
        });
    }

    function normalizePath(dir, name)
    {
        var value = (name || '').replace(/\\/g, '/').replace(/^\/+/, '');

        if (value.length === 0)
        {
            return dir || '';
        }

        if (value.indexOf('/') >= 0)
        {
            return value;
        }

        return dir ? dir.replace(/\/+$/, '') + '/' + value : value;
    }

    function fileExists(path)
    {
        return request('list', dirname(path)).then(function(data)
        {
            var name = basename(path);
            var items = data.items || [];

            for (var i = 0; i < items.length; i++)
            {
                if (!items[i].directory && items[i].name === name)
                {
                    return true;
                }
            }

            return false;
        }, function()
        {
            return false;
        });
    }

    function DockerFile(ui, data, path)
    {
        DrawioFile.call(this, ui, data);
        this.path = ensureExtension(path || 'diagram.drawio');
        this.title = basename(this.path);
        this.desc = this.getEtag(data);
    }

    mxUtils.extend(DockerFile, DrawioFile);

    DockerFile.prototype.autosaveDelay = 1000;
    DockerFile.prototype.maxAutosaveDelay = 20000;

    DockerFile.prototype.getEtag = function(data)
    {
        return this.ui.hashValue((data != null) ? data : '');
    };

    DockerFile.prototype.getMode = function()
    {
        return dockerMode;
    };

    DockerFile.prototype.getTitle = function()
    {
        return this.title;
    };

    DockerFile.prototype.getHash = function()
    {
        return dockerHashPrefix + encodeURIComponent(this.path);
    };

    DockerFile.prototype.getDescriptor = function()
    {
        return this.desc;
    };

    DockerFile.prototype.setDescriptor = function(desc)
    {
        this.desc = desc;
    };

    DockerFile.prototype.isRenamable = function()
    {
        return true;
    };

    DockerFile.prototype.isSyncSupported = function()
    {
        return true;
    };

    DockerFile.prototype.isPolling = function()
    {
        return this.isSyncSupported();
    };

    DockerFile.prototype.getPollingInterval = function()
    {
        return 10000;
    };

    DockerFile.prototype.isAutosaveOptional = function()
    {
        return true;
    };

    DockerFile.prototype.getLatestVersion = function(success, error)
    {
        request('read', this.path, {text: true}).then(mxUtils.bind(this, function(data)
        {
            success(new DockerFile(this.ui, data, this.path));
        })).catch(error);
    };

    DockerFile.prototype.save = function(revision, success, error)
    {
        DrawioFile.prototype.save.apply(this, [false, mxUtils.bind(this, function()
        {
            this.saveFile(this.path, false, success, error);
        }), error]);
    };

    DockerFile.prototype.saveAs = function(title, success, error)
    {
        var path = normalizePath(dirname(this.path), title);
        this.saveFile(ensureExtension(path), false, success, error, true);
    };

    DockerFile.prototype.rename = function(title, success, error)
    {
        this.saveAs(title, success, error);
    };

    DockerFile.prototype.saveFile = function(path, revision, success, error, confirmOverwrite)
    {
        path = ensureExtension(path || this.path);

        var fn = mxUtils.bind(this, function()
        {
            this.writeFile(path, success, error);
        });

        if (confirmOverwrite && path !== this.path)
        {
            fileExists(path).then(mxUtils.bind(this, function(exists)
            {
                if (exists)
                {
                    this.ui.confirm(mxResources.get('replaceIt', [path]), fn, error);
                }
                else
                {
                    fn();
                }
            })).catch(error);
        }
        else
        {
            fn();
        }
    };

    DockerFile.prototype.writeFile = function(path, success, error)
    {
        path = ensureExtension(path || this.path);
        this.updateFileData();

        if (this.savingFile)
        {
            return;
        }

        this.savingFileTime = new Date();
        this.savingFile = true;

        var errorWrapper = mxUtils.bind(this, function(err)
        {
            this.savingFile = false;

            if (error != null)
            {
                error(err);
            }
            else
            {
                this.ui.handleError(err);
            }
        });

        if (/(\.png)$/i.test(path))
        {
            var pngDesc = this.getDescriptor();
            var pngData = this.getData();

            this.setShadowModified(false);

            savePngToDocker(this.ui, path, mxUtils.bind(this, function()
            {
                this.path = path;
                this.title = basename(path);
                this.setModified(this.getShadowModified());
                this.savingFile = false;
                this.setDescriptor(this.getEtag(pngData));
                this.contentChanged();
                this.fileSaved(pngData, pngDesc, success, error);
            }), errorWrapper, true);

            return;
        }

        var desc = this.getDescriptor();
        var data = this.getData();

        this.setShadowModified(false);

        request('save', path, {
            method: 'POST',
            headers: {'Content-Type': 'text/xml;charset=UTF-8'},
            body: data
        }).then(mxUtils.bind(this, function()
        {
            this.path = path;
            this.title = basename(path);
            this.setModified(this.getShadowModified());
            this.savingFile = false;
            this.setDescriptor(this.getEtag(data));
            this.contentChanged();
            this.fileSaved(data, desc, success, error);
        })).catch(errorWrapper);
    };

    function saveRawToDocker(ui, path, data, success)
    {
        var fn = function()
        {
            request('save', path, {
                method: 'POST',
                headers: {'Content-Type': 'text/xml;charset=UTF-8'},
                body: data
            }).then(function()
            {
                if (success != null)
                {
                    success();
                }

                ui.updateStatus(function()
                {
                    ui.editor.setStatus('Saved to Docker Files: ' + path);
                });
            }).catch(function(err)
            {
                ui.handleError(err);
            });
        };

        fileExists(path).then(function(exists)
        {
            if (exists)
            {
                ui.confirm(mxResources.get('replaceIt', [path]), fn);
            }
            else
            {
                fn();
            }
        }).catch(function(err)
        {
            ui.handleError(err);
        });
    }

    function savePngToDocker(ui, path, success, error, skipOverwriteConfirm)
    {
        var fn = function()
        {
            var spinning = false;

            try
            {
                spinning = ui.spinner.spin(document.body, mxResources.get('exporting'));

                ui.editor.exportToCanvas(function(canvas)
                {
                    if (spinning)
                    {
                        ui.spinner.stop();
                    }

                    try
                    {
                        var data = ui.createImageDataUri(canvas,
                            ui.getFileData(true), 'png');
                        saveBase64ToDocker(ui, path,
                            data.substring(data.lastIndexOf(',') + 1),
                            success, error);
                    }
                    catch (err)
                    {
                        if (error != null)
                        {
                            error(err);
                        }
                        else
                        {
                            ui.handleError(err);
                        }
                    }
                }, null, null, null, function(err)
                {
                    if (spinning)
                    {
                        ui.spinner.stop();
                    }

                    if (error != null)
                    {
                        error(err);
                    }
                    else
                    {
                        ui.handleError(err);
                    }
                }, null, ui.editor.graph.isSelectionEmpty(), 1);
            }
            catch (err)
            {
                if (spinning)
                {
                    ui.spinner.stop();
                }

                if (error != null)
                {
                    error(err);
                }
                else
                {
                    ui.handleError(err);
                }
            }
        };

        if (skipOverwriteConfirm)
        {
            fn();
            return;
        }

        fileExists(path).then(function(exists)
        {
            if (exists)
            {
                ui.confirm(mxResources.get('replaceIt', [path]), fn);
            }
            else
            {
                fn();
            }
        }).catch(function(err)
        {
            if (error != null)
            {
                error(err);
            }
            else
            {
                ui.handleError(err);
            }
        });
    }

    function saveCurrentToDocker(ui, path, success)
    {
        if (!path)
        {
            ui.alert('Enter a file name or path.');
            return;
        }

        path = ensureExtension(path);

        var file = ui.getCurrentFile();

        if (/(\.png)$/i.test(path))
        {
            savePngToDocker(ui, path, success);
            return;
        }

        var data = getDataForPath(ui, path);

        if (!isDiagramPath(path))
        {
            saveRawToDocker(ui, path, data, success);
            return;
        }

        var dockerFile = file instanceof DockerFile ? file : new DockerFile(ui, data, path);

        dockerFile.setData(data);
        dockerFile.saveFile(path, false, function()
        {
            if (!(file instanceof DockerFile) || file !== dockerFile)
            {
                ui.fileLoaded(dockerFile, null, success);
            }
            else if (success != null)
            {
                success();
            }

            ui.updateStatus(function()
            {
                ui.editor.setStatus('Saved to Docker Files: ' + path);
            });
        }, function(err)
        {
            ui.handleError(err);
        }, true);
    }

    function loadDockerFile(ui, data, path, success)
    {
        var currentFile = ui.getCurrentFile();
        var load = function()
        {
            var file = new DockerFile(ui, data, path);

            ui.hideDialog();
            ui.fileLoaded(file);
            addDockerRecent(ui, file);

            if (success != null)
            {
                success();
            }

            ui.updateStatus(function()
            {
                ui.editor.setStatus('Opened from Docker Files: ' + path);
            });
        };

        if (currentFile != null && currentFile.isModified())
        {
            ui.confirm(mxResources.get('allChangesLost'), null, load,
                mxResources.get('cancel'), mxResources.get('discardChanges'));
        }
        else
        {
            load();
        }
    }

    function addDockerRecent(ui, file)
    {
        try
        {
            if (ui.addRecent != null)
            {
                ui.addRecent({
                    id: file.getHash(),
                    title: file.getTitle(),
                    mode: file.getMode()
                });
            }
        }
        catch (e)
        {
            // ignore
        }
    }

    function openDockerPath(ui, path, success)
    {
        if (!path)
        {
            ui.alert('Select a Docker file first.');
            return;
        }

        path = ensureExtension(path);

        if (/(\.png)$/i.test(path))
        {
            request('read', path, {
                text: true,
                params: {encoding: 'base64'}
            }).then(function(data)
            {
                var xml = ui.extractGraphModelFromPng('data:image/png;base64,' + data);

                if (xml != null && xml.length > 0)
                {
                    loadDockerFile(ui, xml, path, success);
                }
                else
                {
                    ui.handleError({message: mxResources.get('notADiagramFile')},
                        mxResources.get('errorLoadingFile'));
                }
            }).catch(function(err)
            {
                ui.handleError(err);
            });

            return;
        }
        else if (!isDiagramPath(path))
        {
            ui.handleError({message: mxResources.get('notADiagramFile')},
                mxResources.get('errorLoadingFile'));
            return;
        }

        request('read', path, {text: true}).then(function(xml)
        {
            loadDockerFile(ui, xml, path, success);
        }).catch(function(err)
        {
            ui.handleError(err);
        });
    }

    function downloadDockerPath(ui, path)
    {
        if (!path)
        {
            ui.alert('Select a Docker file first.');
            return;
        }

        path = ensureExtension(path);

        if (!isDiagramPath(path))
        {
            window.open(api + '?action=read&path=' + encodeURIComponent(path), '_blank');
            return;
        }

        request('read', path, {text: true}).then(function(xml)
        {
            ui.saveLocalFile(xml, basename(path), getMimeType(path), false,
                getExtension(path) || 'xml');
        }).catch(function(err)
        {
            ui.handleError(err);
        });
    }

    function deleteDockerPath(ui, item, success)
    {
        if (item == null || item.directory)
        {
            ui.alert('Select a Docker file first.');
            return;
        }

        ui.confirm('Delete "' + item.path + '"?', function()
        {
            request('delete', item.path, {method: 'POST'}).then(function()
            {
                if (success != null)
                {
                    success();
                }

                ui.updateStatus(function()
                {
                    ui.editor.setStatus('Deleted from Docker Files: ' + item.path);
                });
            }).catch(function(err)
            {
                ui.handleError(err);
            });
        });
    }

    function showDockerDialog(ui, mode, suggestedName)
    {
        var currentPath = '';
        var selected = null;
        var panel = document.createElement('div');
        panel.className = 'dxDockerPanel';

        var list = document.createElement('div');
        list.className = 'dxDockerList';
        panel.appendChild(list);

        var footer = document.createElement('div');
        footer.className = 'dxDockerFooter';

        var nameInput = document.createElement('input');
        nameInput.className = 'dxDockerName';
        nameInput.setAttribute('placeholder', 'diagram.drawio');
        footer.appendChild(nameInput);

        var saveButton = buttonNode('Save', mode === 'save');
        var deleteButton = buttonNode('Delete');
        var downloadButton = buttonNode('Download');
        footer.appendChild(saveButton);
        footer.appendChild(deleteButton);
        footer.appendChild(downloadButton);
        panel.appendChild(footer);

        function buttonNode(label, primary)
        {
            var node = document.createElement('button');
            node.className = 'dxDockerBtn' + (primary ? ' dxDockerPrimary' : '');
            node.setAttribute('type', 'button');
            node.textContent = label;
            return node;
        }

        function render(items)
        {
            list.innerHTML = '';
            selected = null;

            if (items.length === 0)
            {
                var empty = document.createElement('div');
                empty.className = 'dxDockerRow dxDockerMuted';
                empty.textContent = 'Empty folder';
                list.appendChild(empty);
                return;
            }

            items.forEach(function(item)
            {
                var row = document.createElement('div');
                row.className = 'dxDockerRow';
                row.innerHTML =
                    '<span>' + (item.directory ? '&#128193;' : '&#128196;') + '</span>' +
                    '<span></span>' +
                    '<span class="dxDockerMuted">' + (item.directory ? 'Folder' : Math.ceil(item.size / 1024) + ' KB') + '</span>' +
                    '<span class="dxDockerMuted">' + new Date(item.modified).toLocaleString() + '</span>';
                row.children[1].textContent = item.name;

                row.addEventListener('click', function()
                {
                    var rows = list.querySelectorAll('.dxDockerRow');

                    for (var i = 0; i < rows.length; i++)
                    {
                        rows[i].classList.remove('dxSelected');
                    }

                    row.classList.add('dxSelected');
                    selected = item;
                    nameInput.value = item.directory ? '' : item.path;
                });

                row.addEventListener('dblclick', function()
                {
                    if (item.directory)
                    {
                        load(item.path);
                    }
                    else if (mode === 'save')
                    {
                        nameInput.value = item.path;
                    }
                    else
                    {
                        openDockerPath(ui, item.path);
                    }
                });

                list.appendChild(row);
            });
        }

        function load(path)
        {
            currentPath = path || '';
            list.innerHTML = '<div class="dxDockerRow dxDockerMuted">Loading...</div>';

            request('list', currentPath).then(function(data)
            {
                currentPath = data.path || '';
                render(data.items || []);
            }).catch(function(err)
            {
                ui.handleError(err);
            });
        }

        saveButton.addEventListener('click', function()
        {
            saveCurrentToDocker(ui, normalizePath(currentPath, nameInput.value), function()
            {
                ui.hideDialog();
            });
        });

        downloadButton.addEventListener('click', function()
        {
            var path = selected && !selected.directory ? selected.path : nameInput.value;
            downloadDockerPath(ui, path);
        });

        deleteButton.addEventListener('click', function()
        {
            deleteDockerPath(ui, selected, function()
            {
                nameInput.value = '';
                load(currentPath);
            });
        });

        var currentFile = ui.getCurrentFile();

        if (mode === 'save' && suggestedName != null && suggestedName.length > 0)
        {
            nameInput.value = suggestedName;
        }
        else if (mode === 'save' && currentFile != null && currentFile.getTitle() != null)
        {
            nameInput.value = currentFile instanceof DockerFile ?
                currentFile.path : currentFile.getTitle();
            currentPath = currentFile instanceof DockerFile ?
                dirname(currentFile.path) : '';
        }

        ui.showDialog(panel, 560, 390, true, true);
        load(currentPath);
    }

    function patchSaveDialog()
    {
        if (typeof SaveDialog === 'undefined' || SaveDialog._dockerStoragePatched)
        {
            return;
        }

        var OriginalSaveDialog = SaveDialog;
        var DOCKER_VALUE = 'docker';
        var DOCKER_LABEL = 'Docker Files';

        SaveDialog = function(editorUi, title, saveFn, disabledModes, data, mimeType,
            base64Encoded, defaultMode, folderPickerMode, enabledModes, saveBtnLabel)
        {
            OriginalSaveDialog.apply(this, arguments);

            // Only patch the normal Save As dialog; image export and folder
            // picker modes use a different layout.
            if (mimeType != null || folderPickerMode != null || this.container == null)
            {
                return;
            }

            // The "Where:" storage select is the LAST <select> in the dialog.
            // When saving a diagram, a "Type:" (format) select precedes it, so
            // querySelector('select') would wrongly target the Type select.
            var selects = this.container.querySelectorAll('select');
            var storageSelect = (selects.length > 0) ? selects[selects.length - 1] : null;
            var input = this.container.querySelector('input[type="text"]');
            var saveBtn = this.container.querySelector('.gePrimaryBtn');

            if (storageSelect == null || input == null || saveBtn == null)
            {
                return;
            }

            function ensureDockerOption()
            {
                var option = storageSelect.querySelector('option[value="' + DOCKER_VALUE + '"]');

                if (option == null)
                {
                    option = document.createElement('option');
                    option.setAttribute('value', DOCKER_VALUE);
                    option.setAttribute('title', DOCKER_LABEL);
                    mxUtils.write(option, DOCKER_LABEL);
                }

                if (option !== storageSelect.firstChild)
                {
                    storageSelect.insertBefore(option, storageSelect.firstChild);
                }
            }

            ensureDockerOption();

            // drawio wipes storageSelect.innerHTML on reset / pick-folder and
            // rebuilds the option list, removing our entry; re-add it then.
            var observer = new MutationObserver(function()
            {
                ensureDockerOption();
            });
            observer.observe(storageSelect, {childList: true});

            storageSelect.value = DOCKER_VALUE;
            storageSelect.dispatchEvent(new Event('change'));

            saveBtn.addEventListener('click', function(evt)
            {
                if (storageSelect.value == DOCKER_VALUE)
                {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();

                    SaveDialog.lastValue = DOCKER_VALUE;
                    editorUi.hideDialog();
                    showDockerDialog(editorUi, 'save', input.value);
                }
            }, true);
        };

        SaveDialog.prototype = OriginalSaveDialog.prototype;
        SaveDialog.lastValue = OriginalSaveDialog.lastValue;
        SaveDialog._dockerStoragePatched = true;
    }

    function patchLoadFile()
    {
        if (typeof App === 'undefined' || App.prototype.loadFile == null ||
            App.prototype.loadFile._dockerStoragePatched)
        {
            return;
        }

        var originalLoadFile = App.prototype.loadFile;

        App.prototype.loadFile = function(id, sameWindow, file, success, force)
        {
            if (id != null && id.substring(0, dockerHashPrefix.length) == dockerHashPrefix)
            {
                this.hideDialog();
                openDockerPath(this, decodeURIComponent(id.substring(dockerHashPrefix.length)), success);
                return;
            }
            else if (id != null && id.charAt(0) == 'D')
            {
                var dockerPath = decodeURIComponent(id.substring(1));

                if (isDockerOpenablePath(dockerPath))
                {
                    this.hideDialog();
                    openDockerPath(this, dockerPath, success);
                    return;
                }
            }

            return originalLoadFile.apply(this, arguments);
        };

        App.prototype.loadFile._dockerStoragePatched = true;
    }

    function migrateDockerRecent()
    {
        if (typeof isLocalStorage === 'undefined' || !isLocalStorage ||
            typeof localStorage === 'undefined' || localStorage == null)
        {
            return;
        }

        try
        {
            var value = localStorage.getItem('.recent');

            if (value == null)
            {
                return;
            }

            var recent = JSON.parse(value);
            var changed = false;

            for (var i = 0; i < recent.length; i++)
            {
                if (recent[i] != null && recent[i].mode == dockerMode &&
                    typeof recent[i].id === 'string' &&
                    recent[i].id.charAt(0) == 'D' &&
                    recent[i].id.substring(0, dockerHashPrefix.length) != dockerHashPrefix)
                {
                    recent[i].id = dockerHashPrefix + recent[i].id.substring(1);
                    changed = true;
                }
            }

            if (changed)
            {
                localStorage.setItem('.recent', JSON.stringify(recent));
            }
        }
        catch (e)
        {
            // ignore
        }
    }

    function patchMenu(ui, name, addItems, prepend)
    {
        if (ui.menus == null || ui.menus.get == null || ui.menus.put == null ||
            typeof Menu === 'undefined')
        {
            return;
        }

        var oldMenu = ui.menus.get(name);

        if (oldMenu == null || oldMenu._dockerStoragePatched)
        {
            return;
        }

        var oldFunct = oldMenu.funct;
        var menu = new Menu(function(popup, parent)
        {
            if (prepend)
            {
                addItems(popup, parent);
            }

            if (oldFunct != null)
            {
                oldFunct.apply(oldMenu, arguments);
            }

            if (!prepend)
            {
                addItems(popup, parent);
            }
        }, oldMenu.enabled);

        menu._dockerStoragePatched = true;
        ui.menus.put(name, menu);
    }

    function install(ui)
    {
        if (installed || ui == null || ui.editor == null)
        {
            return;
        }

        installed = true;

        var style = document.createElement('style');
        style.textContent =
            '.dxDockerPanel{font-family:Helvetica,Arial,sans-serif;color:#20242a;min-width:520px}' +
            '.dxDockerList{height:280px;overflow:auto;border:1px solid #d7dbe2;border-radius:4px;background:#fff}' +
            '.dxDockerRow{display:grid;grid-template-columns:24px 1fr 90px 120px;gap:8px;align-items:center;height:31px;padding:0 8px;border-bottom:1px solid #eef0f3;font-size:13px;cursor:default}' +
            '.dxDockerRow:hover,.dxDockerRow.dxSelected{background:#eef5ff}' +
            '.dxDockerMuted{color:#69707a}' +
            '.dxDockerFooter{display:flex;gap:8px;align-items:center;margin-top:10px}' +
            '.dxDockerName{flex:1;height:30px;border:1px solid #c9ced6;border-radius:3px;padding:0 8px;font-size:13px}' +
            '.dxDockerBtn{height:30px;padding:0 12px;border:1px solid #b9c0c9;border-radius:4px;background:#fff;color:#20242a;font-size:13px;cursor:pointer}' +
            '.dxDockerBtn:hover{background:#f4f6f8}' +
            '.dxDockerPrimary{background:#1f6feb;border-color:#1f6feb;color:#fff}' +
            '.dxDockerPrimary:hover{background:#195fc9}';
        document.head.appendChild(style);

        if (ui.actions != null)
        {
            ui.actions.addAction('openDockerServer...', function()
            {
                showDockerDialog(ui, 'open');
            }).label = 'Docker Files...';

            ui.actions.addAction('saveAsDockerServer...', function()
            {
                showDockerDialog(ui, 'save');
            }).label = 'Docker Files...';
        }

        patchMenu(ui, 'openFrom', function(menu, parent)
        {
            menu.addItem('Docker Files...', null, function()
            {
                showDockerDialog(ui, 'open');
            }, parent);
            menu.addSeparator(parent);
        }, true);

        var addSaveAsDocker = function(menu, parent)
        {
            menu.addSeparator(parent);
            menu.addItem('Save As to Docker Files...', null, function()
            {
                showDockerDialog(ui, 'save');
            }, parent);
        };

        var addSaveAsDockerFirst = function(menu, parent)
        {
            menu.addItem('Save As to Docker Files...', null, function()
            {
                showDockerDialog(ui, 'save');
            }, parent);
            menu.addSeparator(parent);
        };

        patchMenu(ui, 'file', addSaveAsDocker);
        patchMenu(ui, 'save', addSaveAsDockerFirst, true);
        patchLoadFile();
        migrateDockerRecent();
        patchSaveDialog();
    }

    var editorUiInit = EditorUi.prototype.init;

    EditorUi.prototype.init = function()
    {
        editorUiInit.apply(this, arguments);
        install(this);
    };
})();
