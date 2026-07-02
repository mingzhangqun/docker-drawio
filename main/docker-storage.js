(function()
{
    if (!window.DRAWIO_DOCKER_FILE_STORAGE_ENABLED || typeof EditorUi === 'undefined')
    {
        return;
    }

    var api = 'docker-storage.jsp';
    var installed = false;

    function request(action, path, options)
    {
        options = options || {};
        var url = api + '?action=' + encodeURIComponent(action) + '&path=' + encodeURIComponent(path || '');

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

    function install(ui)
    {
        if (installed || ui == null || ui.editor == null)
        {
            return;
        }

        installed = true;

        var style = document.createElement('style');
        style.textContent =
            '.dxDockerButton{position:fixed;right:18px;bottom:18px;z-index:10006;height:34px;padding:0 13px;border:1px solid #b9c0c9;border-radius:4px;background:#fff;color:#20242a;font:13px/32px Helvetica,Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);cursor:pointer}' +
            '.dxDockerButton:hover{background:#f4f6f8}' +
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

        var button = document.createElement('button');
        button.className = 'dxDockerButton';
        button.setAttribute('type', 'button');
        button.setAttribute('title', 'Open or save files in the Docker mounted folder');
        button.textContent = 'Docker files';
        document.body.appendChild(button);

        function showPanel()
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

            var openButton = buttonNode('Open');
            var saveButton = buttonNode('Save', true);
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

            function basename(path)
            {
                var parts = (path || '').split('/');
                return parts[parts.length - 1] || 'diagram.drawio';
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
                        else
                        {
                            openDockerFile(item.path);
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

            function openDockerFile(path)
            {
                request('read', path, {text: true}).then(function(xml)
                {
                    ui.hideDialog();
                    ui.openLocalFile(xml, basename(path), true);
                }).catch(function(err)
                {
                    ui.handleError(err);
                });
            }

            function saveDockerFile(path)
            {
                if (!path)
                {
                    ui.alert('Enter a file name or path.');
                    return;
                }

                if (!/(\.drawio|\.xml)$/i.test(path))
                {
                    path += '.drawio';
                }

                request('save', path, {
                    method: 'POST',
                    headers: {'Content-Type': 'text/xml;charset=UTF-8'},
                    body: ui.getFileData(true)
                }).then(function()
                {
                    ui.editor.modified = false;
                    ui.updateStatus(function()
                    {
                        ui.editor.setStatus('Saved to Docker: ' + path);
                    });
                    load(currentPath);
                }).catch(function(err)
                {
                    ui.handleError(err);
                });
            }

            function downloadDockerFile(path)
            {
                if (!path)
                {
                    ui.alert('Select a Docker file first.');
                    return;
                }

                request('read', path, {text: true}).then(function(xml)
                {
                    ui.saveLocalFile(xml, basename(path), 'text/xml', false, 'xml');
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
                openDockerFile(path);
            });

            saveButton.addEventListener('click', function()
            {
                saveDockerFile(normalizePath(currentPath, nameInput.value));
            });

            downloadButton.addEventListener('click', function()
            {
                var path = selected && !selected.directory ? selected.path : nameInput.value;
                downloadDockerFile(path);
            });

            ui.showDialog(panel, 560, 390, true, true);
            load(currentPath);
        }

        button.addEventListener('click', showPanel);
    }

    var editorUiInit = EditorUi.prototype.init;

    EditorUi.prototype.init = function()
    {
        editorUiInit.apply(this, arguments);
        install(this);
    };
})();
