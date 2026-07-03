(function()
{
    if (!window.DRAWIO_DOCKER_FILE_STORAGE_ENABLED ||
        typeof EditorUi === 'undefined' || typeof DrawioFile === 'undefined')
    {
        return;
    }

    var api = 'docker-storage.jsp';
    var installed = false;

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

        return /(\.drawio|\.xml)$/i.test(path || '') ? path : path + '.drawio';
    }

    function request(action, path, options)
    {
        options = options || {};
        var url = api + '?action=' + encodeURIComponent(action) +
            '&path=' + encodeURIComponent(path || '');

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
        return 'docker';
    };

    DockerFile.prototype.getTitle = function()
    {
        return this.title;
    };

    DockerFile.prototype.getHash = function()
    {
        return 'D' + encodeURIComponent(this.path);
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
            this.setDescriptor(this.getEtag(data));
            this.contentChanged();
            this.fileSaved(data, desc, success, error);
        })).catch(error);
    };

    function saveCurrentToDocker(ui, path, success)
    {
        if (!path)
        {
            ui.alert('Enter a file name or path.');
            return;
        }

        path = ensureExtension(path);

        var file = ui.getCurrentFile();
        var data = ui.getFileData(true);
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
                ui.editor.setStatus('Saved to Docker Server: ' + path);
            });
        }, function(err)
        {
            ui.handleError(err);
        }, true);
    }

    function openDockerPath(ui, path)
    {
        if (!path)
        {
            ui.alert('Select a Docker file first.');
            return;
        }

        path = ensureExtension(path);

        request('read', path, {text: true}).then(function(xml)
        {
            var currentFile = ui.getCurrentFile();
            var load = function()
            {
                ui.hideDialog();
                ui.fileLoaded(new DockerFile(ui, xml, path));
                ui.updateStatus(function()
                {
                    ui.editor.setStatus('Opened from Docker Server: ' + path);
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

        request('read', ensureExtension(path), {text: true}).then(function(xml)
        {
            ui.saveLocalFile(xml, basename(path), 'text/xml', false, 'xml');
        }).catch(function(err)
        {
            ui.handleError(err);
        });
    }

    function showDockerDialog(ui, mode, suggestedName)
    {
        var currentPath = '';
        var selected = null;
        var panel = document.createElement('div');
        panel.className = 'dxDockerPanel';

        var bar = document.createElement('div');
        bar.className = 'dxDockerBar';

        var pathInput = document.createElement('input');
        pathInput.className = 'dxDockerPath';
        pathInput.setAttribute('placeholder', 'folder path');
        bar.appendChild(pathInput);

        var upButton = buttonNode('Up');
        var refreshButton = buttonNode('Refresh');
        bar.appendChild(upButton);
        bar.appendChild(refreshButton);
        panel.appendChild(bar);

        var list = document.createElement('div');
        list.className = 'dxDockerList';
        panel.appendChild(list);

        var footer = document.createElement('div');
        footer.className = 'dxDockerFooter';

        var nameInput = document.createElement('input');
        nameInput.className = 'dxDockerName';
        nameInput.setAttribute('placeholder', 'diagram.drawio');
        footer.appendChild(nameInput);

        var openButton = buttonNode('Open', mode === 'open');
        var saveButton = buttonNode('Save', mode === 'save');
        var downloadButton = buttonNode('Download');
        footer.appendChild(openButton);
        footer.appendChild(saveButton);
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
            pathInput.value = currentPath;
            list.innerHTML = '<div class="dxDockerRow dxDockerMuted">Loading...</div>';

            request('list', currentPath).then(function(data)
            {
                currentPath = data.path || '';
                pathInput.value = currentPath;
                render(data.items || []);
            }).catch(function(err)
            {
                ui.handleError(err);
            });
        }

        pathInput.addEventListener('keydown', function(evt)
        {
            if (evt.key === 'Enter')
            {
                load(pathInput.value);
            }
        });

        upButton.addEventListener('click', function()
        {
            var parts = currentPath.split('/').filter(Boolean);
            parts.pop();
            load(parts.join('/'));
        });

        refreshButton.addEventListener('click', function()
        {
            load(pathInput.value);
        });

        openButton.addEventListener('click', function()
        {
            var path = selected && !selected.directory ? selected.path : nameInput.value;
            openDockerPath(ui, path);
        });

        saveButton.addEventListener('click', function()
        {
            saveCurrentToDocker(ui, normalizePath(currentPath, nameInput.value), function()
            {
                load(currentPath);
            });
        });

        downloadButton.addEventListener('click', function()
        {
            var path = selected && !selected.directory ? selected.path : nameInput.value;
            downloadDockerPath(ui, path);
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

        SaveDialog = function(editorUi, title, saveFn, disabledModes, data, mimeType,
            base64Encoded, defaultMode, folderPickerMode, enabledModes, saveBtnLabel)
        {
            OriginalSaveDialog.apply(this, arguments);

            if (mimeType != null || folderPickerMode != null || this.container == null)
            {
                return;
            }

            var storageSelect = this.container.querySelector('select');
            var input = this.container.querySelector('input[type="text"]');
            var saveBtn = this.container.querySelector('.gePrimaryBtn');

            if (storageSelect == null || input == null || saveBtn == null)
            {
                return;
            }

            var option = document.createElement('option');
            option.setAttribute('value', 'docker');
            option.setAttribute('title', 'Docker Server');
            mxUtils.write(option, 'Docker Server');
            storageSelect.appendChild(option);

            if (SaveDialog.lastValue == 'docker')
            {
                storageSelect.value = 'docker';
                storageSelect.dispatchEvent(new Event('change'));
            }

            saveBtn.addEventListener('click', function(evt)
            {
                if (storageSelect.value == 'docker')
                {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();

                    SaveDialog.lastValue = 'docker';
                    editorUi.hideDialog();
                    showDockerDialog(editorUi, 'save', input.value);
                }
            }, true);
        };

        SaveDialog.prototype = OriginalSaveDialog.prototype;
        SaveDialog.lastValue = OriginalSaveDialog.lastValue;
        SaveDialog._dockerStoragePatched = true;
    }

    function patchMenu(ui, name, addItems)
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
            if (oldFunct != null)
            {
                oldFunct.apply(oldMenu, arguments);
            }

            addItems(popup, parent);
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
            '.dxDockerBar{display:flex;gap:8px;align-items:center;margin-bottom:10px}' +
            '.dxDockerPath{flex:1;height:28px;border:1px solid #c9ced6;border-radius:3px;padding:0 8px;font-size:13px}' +
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
            }).label = 'Docker Server...';

            ui.actions.addAction('saveAsDockerServer...', function()
            {
                showDockerDialog(ui, 'save');
            }).label = 'Docker Server...';
        }

        patchMenu(ui, 'openFrom', function(menu, parent)
        {
            menu.addSeparator(parent);
            menu.addItem('Docker Server...', null, function()
            {
                showDockerDialog(ui, 'open');
            }, parent);
        });

        var addSaveAsDocker = function(menu, parent)
        {
            menu.addSeparator(parent);
            menu.addItem('Save As to Docker Server...', null, function()
            {
                showDockerDialog(ui, 'save');
            }, parent);
        };

        patchMenu(ui, 'file', addSaveAsDocker);
        patchMenu(ui, 'save', addSaveAsDocker);
        patchSaveDialog();
    }

    var editorUiInit = EditorUi.prototype.init;

    EditorUi.prototype.init = function()
    {
        editorUiInit.apply(this, arguments);
        install(this);
    };
})();
