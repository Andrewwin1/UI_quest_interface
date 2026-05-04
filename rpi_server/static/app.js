// ============ ГЛОБАЛЬНОЕ СОСТОЯНИЕ ============
const state = {
    devices: [],
    sounds: [],
    scenarios: [],
    currentScenario: null,
    currentDevice: null,
    ws: null,
    connected: false,
    systemState: {
        inputs: Array(15).fill(0),
        outputs: Array(15).fill(0),
        pwm_power: Array(15).fill(0),
        pwm_strobo: Array(15).fill(0),
        analog: Array(15).fill(0),
        running_scenarios: []
    }
};

// ============ WEBSOCKET ============
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        state.connected = true;
        updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state') {
            state.systemState = msg.data;
            updateControlPanel();
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        state.connected = false;
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    state.ws = ws;
}

function updateConnectionStatus(connected) {
    const badge = document.getElementById('connection-status');
    if (connected) {
        badge.textContent = 'Подключено';
        badge.className = 'status-badge connected';
    } else {
        badge.textContent = 'Отключено';
        badge.className = 'status-badge disconnected';
    }
}

// ============ API ФУНКЦИИ ============
async function apiGet(url) {
    const response = await fetch(url);
    return await response.json();
}

async function apiPost(url, data = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    return await response.json();
}

async function apiPut(url, data = {}) {
    const response = await fetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    return await response.json();
}

async function apiDelete(url) {
    const response = await fetch(url, {method: 'DELETE'});
    return await response.json();
}

// ============ НАВИГАЦИЯ ПО ВКЛАДКАМ ============
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'control') loadDevices();
    if (tabName === 'devices') loadDevicesTable();
    if (tabName === 'sounds') loadSounds();
    if (tabName === 'scenarios') loadScenarios();
    if (tabName === 'settings') loadSettings();
}

// ============ ПАНЕЛЬ УПРАВЛЕНИЯ ============
function updateControlPanel() {
    updateOutputs();
    updatePWM();
    updateInputs();
    updateAnalog();
}

function updateOutputs() {
    const container = document.getElementById('outputs-list');
    const devices = state.devices.filter(d => d.type === 'output');

    container.innerHTML = devices.map(device => `
        <div class="device-item">
            <div class="device-info">
                <span class="device-icon">${device.icon}</span>
                <div>
                    <div class="device-name">${device.name}</div>
                    <div class="device-pin">Пин ${device.pin}</div>
                </div>
            </div>
            <div class="device-control">
                <div class="toggle ${state.systemState.outputs[device.pin] ? 'active' : ''}"
                     onclick="toggleOutput(${device.pin})"></div>
            </div>
        </div>
    `).join('');
}

function updatePWM() {
    const container = document.getElementById('pwm-list');
    const devices = state.devices.filter(d => d.type === 'pwm');

    container.innerHTML = devices.map(device => `
        <div class="device-item">
            <div class="device-info">
                <span class="device-icon">${device.icon}</span>
                <div>
                    <div class="device-name">${device.name}</div>
                    <div class="device-pin">Пин ${device.pin}</div>
                </div>
            </div>
            <div class="device-control">
                <div class="slider-control">
                    <input type="range" class="slider" min="0" max="255"
                           value="${state.systemState.pwm_power[device.pin]}"
                           oninput="setPWM(${device.pin}, this.value)">
                    <div class="slider-value">${state.systemState.pwm_power[device.pin]}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function updateInputs() {
    const container = document.getElementById('inputs-list');
    const devices = state.devices.filter(d => d.type === 'input');

    container.innerHTML = devices.map(device => `
        <div class="device-item">
            <div class="device-info">
                <span class="device-icon">${device.icon}</span>
                <div>
                    <div class="device-name">${device.name}</div>
                    <div class="device-pin">Пин ${device.pin}</div>
                </div>
            </div>
            <div class="device-control">
                <div class="input-indicator ${state.systemState.inputs[device.pin] ? 'active' : ''}"></div>
            </div>
        </div>
    `).join('');
}

function updateAnalog() {
    const container = document.getElementById('analog-list');
    const devices = state.devices.filter(d => d.type === 'analog');

    container.innerHTML = devices.map(device => {
        const value = state.systemState.analog[device.pin];
        const percent = (value / 1023 * 100).toFixed(1);
        return `
            <div class="device-item">
                <div class="device-info">
                    <span class="device-icon">${device.icon}</span>
                    <div>
                        <div class="device-name">${device.name}</div>
                        <div class="device-pin">Пин ${device.pin}</div>
                    </div>
                </div>
                <div class="device-control">
                    <div style="text-align: right;">
                        <div class="analog-value">${value}</div>
                        <div class="analog-bar">
                            <div class="analog-bar-fill" style="width: ${percent}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleOutput(pin) {
    const newState = state.systemState.outputs[pin] ? 0 : 1;
    await apiPost('/api/control/output', {pin, state: newState});
}

async function setPWM(pin, power) {
    await apiPost('/api/control/pwm', {pin, power: parseInt(power), strobo: 0});
}

// ============ УСТРОЙСТВА ============
async function loadDevices() {
    state.devices = await apiGet('/api/devices');
    updateControlPanel();
}

async function loadDevicesTable() {
    state.devices = await apiGet('/api/devices');
    const tbody = document.getElementById('devices-tbody');

    tbody.innerHTML = state.devices.map(device => `
        <tr>
            <td>${device.icon}</td>
            <td>${device.name}</td>
            <td>${device.type}</td>
            <td>${device.pin}</td>
            <td>${device.group || '-'}</td>
            <td>${device.description || '-'}</td>
            <td>
                <button class="btn btn-small" onclick="editDevice(${device.id})">✏️</button>
                <button class="btn btn-small btn-danger" onclick="deleteDevice(${device.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function showDeviceModal(device = null) {
    const modal = document.getElementById('device-modal');
    const title = document.getElementById('device-modal-title');

    if (device) {
        title.textContent = 'Редактировать устройство';
        document.getElementById('device-name').value = device.name;
        document.getElementById('device-type').value = device.type;
        document.getElementById('device-pin').value = device.pin;
        document.getElementById('device-icon').value = device.icon;
        document.getElementById('device-group').value = device.group || '';
        document.getElementById('device-description').value = device.description || '';
        state.currentDevice = device;
    } else {
        title.textContent = 'Добавить устройство';
        document.getElementById('device-name').value = '';
        document.getElementById('device-type').value = 'output';
        document.getElementById('device-pin').value = '0';
        document.getElementById('device-icon').value = '⚡';
        document.getElementById('device-group').value = '';
        document.getElementById('device-description').value = '';
        state.currentDevice = null;
    }

    modal.classList.add('active');
}

function editDevice(id) {
    const device = state.devices.find(d => d.id === id);
    if (device) showDeviceModal(device);
}

async function saveDevice() {
    const data = {
        name: document.getElementById('device-name').value,
        type: document.getElementById('device-type').value,
        pin: parseInt(document.getElementById('device-pin').value),
        icon: document.getElementById('device-icon').value,
        group: document.getElementById('device-group').value,
        description: document.getElementById('device-description').value
    };

    if (state.currentDevice) {
        await apiPut(`/api/devices/${state.currentDevice.id}`, data);
    } else {
        await apiPost('/api/devices', data);
    }

    closeDeviceModal();
    loadDevicesTable();
}

async function deleteDevice(id) {
    if (confirm('Удалить устройство?')) {
        await apiDelete(`/api/devices/${id}`);
        loadDevicesTable();
    }
}

function closeDeviceModal() {
    document.getElementById('device-modal').classList.remove('active');
}

// ============ СЦЕНАРИИ ============
async function loadScenarios() {
    state.scenarios = await apiGet('/api/scenarios');
    renderScenariosList();
}

function renderScenariosList() {
    const container = document.getElementById('scenarios-list');
    container.innerHTML = state.scenarios.map(scenario => `
        <div class="scenario-card ${scenario.is_active ? 'running' : ''} ${state.currentScenario?.id === scenario.id ? 'active' : ''}"
             onclick="selectScenario(${scenario.id})">
            <div class="scenario-card-header">
                <div class="scenario-card-name">${scenario.name}</div>
                <div class="scenario-card-actions">
                    ${scenario.is_active ?
                        `<button class="btn btn-small btn-danger" onclick="event.stopPropagation(); stopScenario(${scenario.id})">⏹️</button>` :
                        `<button class="btn btn-small btn-success" onclick="event.stopPropagation(); startScenario(${scenario.id})">▶️</button>`
                    }
                </div>
            </div>
            <div class="scenario-card-desc">${scenario.description || 'Без описания'}</div>
        </div>
    `).join('');
}

async function selectScenario(id) {
    state.currentScenario = await apiGet(`/api/scenarios/${id}`);
    renderScenarioEditor();
}

function renderScenarioEditor() {
    document.getElementById('scenario-placeholder').style.display = 'none';
    document.getElementById('scenario-editor').style.display = 'block';

    document.getElementById('scenario-name').value = state.currentScenario.name;
    document.getElementById('scenario-description').value = state.currentScenario.description || '';

    renderActionsList();
}

function renderActionsList() {
    const container = document.getElementById('actions-list');
    const actions = state.currentScenario.actions || [];
    renderActionsInto(actions, container, renderActionsList);
}

function moveActionInArray(arr, from, to, onUpdate) {
    if (to < 0 || to >= arr.length) return;
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    onUpdate();
}

function renderActionsInto(actionsArray, container, onUpdate) {
    const total = actionsArray.length;
    container.innerHTML = actionsArray.map((action, index) => {
        const isBlock = action.type === 'loop' || action.type === 'while_loop' || action.type === 'repeat';
        if (isBlock) return renderBlockAction(action, index, actionsArray, onUpdate, total);
        const upDis = index === 0 ? 'disabled' : '';
        const downDis = index === total - 1 ? 'disabled' : '';
        return `
        <div class="action-item" draggable="true" data-index="${index}">
            <div class="move-arrows">
                <button class="btn-arrow" ${upDis} data-move-index="${index}" data-move-dir="-1" title="Вверх">▲</button>
                <button class="btn-arrow" ${downDis} data-move-index="${index}" data-move-dir="1" title="Вниз">▼</button>
            </div>
            <div class="action-info">
                <div class="action-type">${getActionIcon(action.type)} ${getActionName(action.type)}</div>
                <div class="action-params">${getActionParams(action)}</div>
            </div>
            <div class="action-controls">
                <button class="btn btn-small" onclick="editActionAt(${index}, null, event)">✏️</button>
                <button class="btn btn-small btn-danger" onclick="deleteActionAt(${index}, null, event)">🗑️</button>
            </div>
        </div>`;
    }).join('');
    initDragDrop(container, actionsArray, onUpdate);
}

function getActionIcon(type) {
    const icons = {
        wait: '⏱️', output: '🔌', pwm: '💡', sound: '🔊',
        stop_sound: '🔇', wait_input: '⏳', repeat: '🔁', loop: '♾️', while_loop: '🔄'
    };
    return icons[type] || '❓';
}

function getActionName(type) {
    const names = {
        wait: 'Задержка', output: 'Выход', pwm: 'PWM', sound: 'Звук',
        stop_sound: 'Остановить звук', wait_input: 'Ждать сигнал',
        repeat: 'Повторить', loop: 'Бесконечный цикл', while_loop: 'Цикл с условием'
    };
    return names[type] || type;
}

function getActionParams(action) {
    switch (action.type) {
        case 'wait': return `${action.ms} мс`;
        case 'output': return `Пин ${action.pin} → ${action.state ? 'ВКЛ' : 'ВЫКЛ'}`;
        case 'pwm': return `Пин ${action.pin}, мощность ${action.power}${action.fade ? ', плавно ' + action.fade + 'мс' : ''}`;
        case 'sound': return `${action.file}, громкость ${action.volume}%`;
        case 'stop_sound': return 'все звуки';
        case 'wait_input': return `Пин ${action.pin} = ${action.state}${action.timeout ? ', таймаут ' + action.timeout + 'мс' : ''}`;
        case 'repeat': return `${action.count} раз, ${(action.actions||[]).length} действий`;
        case 'loop': return `${(action.actions||[]).length} действий внутри`;
        case 'while_loop': {
            const parts = [];
            if (action.exit_pin >= 0) parts.push(`вход ${action.exit_pin}=${action.exit_state}`);
            if (action.timeout_ms > 0) parts.push(`таймаут ${action.timeout_ms/1000}с`);
            return (parts.length ? parts.join(' ИЛИ ') : 'только СТОП') + `, ${(action.actions||[]).length} действий`;
        }
        default: return '';
    }
}

function newScenario() {
    state.currentScenario = {
        name: 'Новый сценарий',
        description: '',
        actions: []
    };
    renderScenarioEditor();
}

async function saveScenario() {
    const data = {
        name: document.getElementById('scenario-name').value,
        description: document.getElementById('scenario-description').value,
        actions: state.currentScenario.actions
    };

    if (state.currentScenario.id) {
        await apiPut(`/api/scenarios/${state.currentScenario.id}`, data);
    } else {
        const result = await apiPost('/api/scenarios', data);
        state.currentScenario.id = result.id;
    }

    loadScenarios();
    alert('Сценарий сохранён!');
}

async function startScenario(id) {
    await apiPost(`/api/scenarios/${id}/start`);
    loadScenarios();
}

async function stopScenario(id) {
    await apiPost(`/api/scenarios/${id}/stop`);
    loadScenarios();
}

function closeEditor() {
    document.getElementById('scenario-editor').style.display = 'none';
    document.getElementById('scenario-placeholder').style.display = 'flex';
    state.currentScenario = null;
}

// алиасы для совместимости с inline-вызовами
function editActionAt(index, _unused, event) {
    if (event) event.stopPropagation();
    const action = state.currentScenario.actions[index];
    state._editingNestedParent = null;
    showActionModal(action.type, action, index, false);
}

function deleteActionAt(index, _unused, event) {
    if (event) event.stopPropagation();
    state.currentScenario.actions.splice(index, 1);
    renderActionsList();
}

// ============ DRAG & DROP для списка действий ============
let dragSrcIndex = null;
let dragSrcList = null; // ссылка на массив действий

function initDragDrop(container, actionsArray, onUpdate) {
    container.querySelectorAll('.action-item[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', e => {
            dragSrcIndex = parseInt(item.dataset.index);
            dragSrcList = actionsArray;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            container.querySelectorAll('.action-item').forEach(i => i.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const targetIndex = parseInt(item.dataset.index);
            if (dragSrcList === actionsArray && dragSrcIndex !== targetIndex) {
                const moved = actionsArray.splice(dragSrcIndex, 1)[0];
                actionsArray.splice(targetIndex, 0, moved);
                onUpdate();
            }
        });
    });
}

function renderBlockAction(action, index, parentArray, onUpdate, total) {
    const subId = `sub-${Math.random().toString(36).slice(2,8)}`;
    let headerLabel = '';
    if (action.type === 'while_loop') {
        const exitParts = [];
        if (action.exit_pin >= 0) exitParts.push(`вход ${action.exit_pin} = ${action.exit_state}`);
        if (action.timeout_ms > 0) exitParts.push(`таймаут ${action.timeout_ms / 1000}с`);
        headerLabel = exitParts.length ? `Выход: ${exitParts.join(' ИЛИ ')}` : 'Выход: только СТОП';
    } else if (action.type === 'repeat') {
        headerLabel = `${action.count} раз`;
    } else {
        headerLabel = 'бесконечный';
    }

    const subActions = action.actions || [];
    const subTotal = subActions.length;

    const subItemsHtml = subActions.map((sub, si) => {
        const upDis = si === 0 ? 'disabled' : '';
        const downDis = si === subTotal - 1 ? 'disabled' : '';
        return `
        <div class="action-item action-item-nested" draggable="true" data-index="${si}">
            <div class="move-arrows">
                <button class="btn-arrow" ${upDis} data-move-nested="${index}" data-move-sub="${si}" data-move-dir="-1" title="Вверх">▲</button>
                <button class="btn-arrow" ${downDis} data-move-nested="${index}" data-move-sub="${si}" data-move-dir="1" title="Вниз">▼</button>
            </div>
            <div class="action-info">
                <div class="action-type">${getActionIcon(sub.type)} ${getActionName(sub.type)}</div>
                <div class="action-params">${getActionParams(sub)}</div>
            </div>
            <div class="action-controls">
                <button class="btn btn-small" data-edit-nested="${index}" data-sub-index="${si}">✏️</button>
                <button class="btn btn-small btn-danger" data-del-nested="${index}" data-sub-index="${si}">🗑️</button>
            </div>
        </div>`;
    }).join('');

    const upDis = index === 0 ? 'disabled' : '';
    const downDis = total !== undefined && index === total - 1 ? 'disabled' : '';

    return `
        <div class="action-block" data-index="${index}" draggable="true">
            <div class="action-block-header">
                <div class="move-arrows">
                    <button class="btn-arrow" ${upDis} data-move-index="${index}" data-move-dir="-1" title="Вверх">▲</button>
                    <button class="btn-arrow" ${downDis} data-move-index="${index}" data-move-dir="1" title="Вниз">▼</button>
                </div>
                <div class="action-info">
                    <div class="action-type">${getActionIcon(action.type)} ${getActionName(action.type)}</div>
                    <div class="action-params">${headerLabel}</div>
                </div>
                <div class="action-controls">
                    <button class="btn btn-small" onclick="editActionAt(${index}, null, event)">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="deleteActionAt(${index}, null, event)">🗑️</button>
                </div>
            </div>
            <div class="action-block-body" id="${subId}">
                ${subItemsHtml}
                <div class="action-block-add">
                    <select class="select select-sm" onchange="addNestedAction(${index}, this.value); this.value=''">
                        <option value="">+ добавить внутрь</option>
                        <option value="wait">⏱️ Задержка</option>
                        <option value="output">🔌 Включить выход</option>
                        <option value="pwm">💡 Установить PWM</option>
                        <option value="sound">🔊 Воспроизвести звук</option>
                        <option value="stop_sound">🔇 Остановить звук</option>
                        <option value="wait_input">⏳ Ждать сигнал</option>
                    </select>
                </div>
            </div>
        </div>
    `;
}

function addNestedAction(parentIndex, type) {
    if (!type) return;
    state._editingNestedParent = parentIndex;
    showActionModal(type, null, null, true);
}

// ============ ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ ДЕЙСТВИЙ ============
document.getElementById('action-type')?.addEventListener('change', (e) => {
    if (e.target.value) {
        state._editingNestedParent = null;
        showActionModal(e.target.value);
        e.target.value = '';
    }
});

function buildActionFormHtml(type, action) {
    switch (type) {
        case 'wait':
            return `
                <div class="form-group">
                    <label>Задержка (мс):</label>
                    <input type="number" id="action-ms" class="input" value="${action?.ms || 1000}">
                </div>`;
        case 'output':
            return `
                <div class="form-group">
                    <label>Пин (0-14):</label>
                    <input type="number" id="action-pin" class="input" min="0" max="14" value="${action?.pin ?? 0}">
                </div>
                <div class="form-group">
                    <label>Состояние:</label>
                    <select id="action-state" class="select">
                        <option value="0" ${action?.state === 0 ? 'selected' : ''}>Выключено (0)</option>
                        <option value="1" ${action?.state === 1 ? 'selected' : ''}>Включено (1)</option>
                    </select>
                </div>`;
        case 'pwm':
            return `
                <div class="form-group">
                    <label>Пин (0-14):</label>
                    <input type="number" id="action-pin" class="input" min="0" max="14" value="${action?.pin ?? 0}">
                </div>
                <div class="form-group">
                    <label>Мощность (0-255):</label>
                    <input type="number" id="action-power" class="input" min="0" max="255" value="${action?.power ?? 0}">
                </div>
                <div class="form-group">
                    <label>Плавное изменение (мс, 0 = без плавности):</label>
                    <input type="number" id="action-fade" class="input" value="${action?.fade ?? 0}">
                </div>`;
        case 'sound':
            return `
                <div class="form-group">
                    <label>Звуковой файл:</label>
                    <select id="action-file" class="select">
                        ${state.sounds.map(s => `<option value="${s.filename}" ${action?.file === s.filename ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Громкость (0-100):</label>
                    <input type="number" id="action-volume" class="input" min="0" max="100" value="${action?.volume ?? 100}">
                </div>`;
        case 'stop_sound':
            return `<p style="color:var(--text-muted)">Остановит все звуки</p>`;
        case 'wait_input':
            return `
                <div class="form-group">
                    <label>Пин входа (0-14):</label>
                    <input type="number" id="action-pin" class="input" min="0" max="14" value="${action?.pin ?? 0}">
                </div>
                <div class="form-group">
                    <label>Ждать состояние:</label>
                    <select id="action-state" class="select">
                        <option value="0" ${action?.state === 0 ? 'selected' : ''}>0 (выключен)</option>
                        <option value="1" ${action?.state === 1 ? 'selected' : ''}>1 (включён)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Таймаут (мс, 0 = ждать бесконечно):</label>
                    <input type="number" id="action-timeout" class="input" value="${action?.timeout ?? 30000}">
                </div>`;
        case 'repeat':
            return `
                <div class="form-group">
                    <label>Количество повторений:</label>
                    <input type="number" id="action-count" class="input" min="1" value="${action?.count ?? 1}">
                </div>`;
        case 'loop':
            return `<p style="color:var(--text-muted)">Бесконечный цикл — остановить можно только кнопкой СТОП</p>`;
        case 'while_loop':
            return `
                <p class="form-hint">Цикл выполняется, пока не сработает условие выхода. Можно задать одно или оба условия.</p>
                <div class="form-group">
                    <label>Выход по сигналу — пин входа (-1 = не использовать):</label>
                    <input type="number" id="wl-exit-pin" class="input" min="-1" max="14" value="${action?.exit_pin ?? -1}">
                </div>
                <div class="form-group">
                    <label>Ждать состояние входа:</label>
                    <select id="wl-exit-state" class="select">
                        <option value="0" ${action?.exit_state === 0 ? 'selected' : ''}>0 (выключен)</option>
                        <option value="1" ${(action?.exit_state ?? 1) === 1 ? 'selected' : ''}>1 (включён)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Выход по таймауту (мс, 0 = не использовать):</label>
                    <input type="number" id="wl-timeout" class="input" min="0" value="${action?.timeout_ms ?? 0}">
                </div>`;
        default:
            return '';
    }
}

function collectActionData(type) {
    const action = {type};
    switch (type) {
        case 'wait':
            action.ms = parseInt(document.getElementById('action-ms').value) || 1000;
            break;
        case 'output':
            action.pin = parseInt(document.getElementById('action-pin').value);
            action.state = parseInt(document.getElementById('action-state').value);
            break;
        case 'pwm':
            action.pin = parseInt(document.getElementById('action-pin').value);
            action.power = parseInt(document.getElementById('action-power').value);
            action.fade = parseInt(document.getElementById('action-fade').value) || 0;
            break;
        case 'sound':
            action.file = document.getElementById('action-file').value;
            action.volume = parseInt(document.getElementById('action-volume').value);
            break;
        case 'stop_sound':
            break;
        case 'wait_input':
            action.pin = parseInt(document.getElementById('action-pin').value);
            action.state = parseInt(document.getElementById('action-state').value);
            action.timeout = parseInt(document.getElementById('action-timeout').value) || 0;
            break;
        case 'repeat':
            action.count = parseInt(document.getElementById('action-count').value) || 1;
            action.actions = [];
            break;
        case 'loop':
            action.actions = [];
            break;
        case 'while_loop':
            action.exit_pin = parseInt(document.getElementById('wl-exit-pin').value);
            action.exit_state = parseInt(document.getElementById('wl-exit-state').value);
            action.timeout_ms = parseInt(document.getElementById('wl-timeout').value) || 0;
            action.actions = [];
            break;
    }
    return action;
}

function showActionModal(type, action = null, index = null, nested = false) {
    const modal = document.getElementById('action-modal');
    const form = document.getElementById('action-form');
    document.getElementById('action-modal-title').textContent = action ? 'Редактировать действие' : 'Добавить действие';
    form.innerHTML = buildActionFormHtml(type, action);
    modal.classList.add('active');
    modal.dataset.type = type;
    modal.dataset.index = index !== null ? index : '';
    modal.dataset.nested = nested ? '1' : '0';
    if (action && (action.type === 'while_loop' || action.type === 'loop' || action.type === 'repeat')) {
        modal.dataset.existingActions = JSON.stringify(action.actions || []);
    } else {
        modal.dataset.existingActions = '';
    }
}

function saveAction() {
    const modal = document.getElementById('action-modal');
    const type = modal.dataset.type;
    const indexStr = modal.dataset.index;
    const isNested = modal.dataset.nested === '1';
    const existingActions = modal.dataset.existingActions ? JSON.parse(modal.dataset.existingActions) : [];

    const action = collectActionData(type);
    if ((type === 'while_loop' || type === 'loop' || type === 'repeat') && existingActions.length) {
        action.actions = existingActions;
    }

    if (isNested) {
        const parentIndex = state._editingNestedParent;
        state.currentScenario.actions[parentIndex].actions = state.currentScenario.actions[parentIndex].actions || [];
        state.currentScenario.actions[parentIndex].actions.push(action);
    } else if (indexStr !== '') {
        state.currentScenario.actions[parseInt(indexStr)] = action;
    } else {
        state.currentScenario.actions.push(action);
    }

    renderActionsList();
    closeActionModal();
}

function closeActionModal() {
    document.getElementById('action-modal').classList.remove('active');
}

// делегирование кликов: вложенные кнопки + стрелки
document.addEventListener('click', e => {
    // редактировать вложенный
    const editBtn = e.target.closest('[data-edit-nested]');
    if (editBtn) {
        const pi = parseInt(editBtn.dataset.editNested);
        const si = parseInt(editBtn.dataset.subIndex);
        const sub = state.currentScenario.actions[pi].actions[si];
        state._editingNestedParent = pi;
        state._editingNestedSubIndex = si;
        showActionModal(sub.type, sub, null, false);
        document.getElementById('action-modal').dataset.nestedEdit = `${pi}:${si}`;
    }

    // удалить вложенный
    const delBtn = e.target.closest('[data-del-nested]');
    if (delBtn) {
        const pi = parseInt(delBtn.dataset.delNested);
        const si = parseInt(delBtn.dataset.subIndex);
        state.currentScenario.actions[pi].actions.splice(si, 1);
        renderActionsList();
    }

    // стрелки для вложенных элементов
    const moveNestedBtn = e.target.closest('[data-move-nested]');
    if (moveNestedBtn && !moveNestedBtn.disabled) {
        const pi = parseInt(moveNestedBtn.dataset.moveNested);
        const si = parseInt(moveNestedBtn.dataset.moveSub);
        const dir = parseInt(moveNestedBtn.dataset.moveDir);
        const arr = state.currentScenario.actions[pi].actions;
        const to = si + dir;
        if (to >= 0 && to < arr.length) {
            const item = arr.splice(si, 1)[0];
            arr.splice(to, 0, item);
            renderActionsList();
        }
    }

    // стрелки для элементов верхнего уровня
    const moveBtn = e.target.closest('[data-move-index]:not([data-move-nested])');
    if (moveBtn && !moveBtn.disabled) {
        const from = parseInt(moveBtn.dataset.moveIndex);
        const dir = parseInt(moveBtn.dataset.moveDir);
        const arr = state.currentScenario.actions;
        const to = from + dir;
        if (to >= 0 && to < arr.length) {
            const item = arr.splice(from, 1)[0];
            arr.splice(to, 0, item);
            renderActionsList();
        }
    }
});

// ============ ЗВУКИ ============
async function loadSounds() {
    state.sounds = await apiGet('/api/sounds');
    renderSounds();
}

function renderSounds() {
    const container = document.getElementById('sounds-grid');
    container.innerHTML = state.sounds.map(sound => `
        <div class="sound-card">
            <div class="sound-icon">🔊</div>
            <div class="sound-name">${sound.name}</div>
            <div class="sound-duration">${sound.duration.toFixed(1)}s</div>
            <div class="sound-actions">
                <button class="btn btn-small btn-success" onclick="playSound(${sound.id})">▶️</button>
                <button class="btn btn-small btn-danger" onclick="deleteSound(${sound.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function uploadSound() {
    const input = document.getElementById('sound-upload');
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    await fetch('/api/sounds/upload', {
        method: 'POST',
        body: formData
    });

    input.value = '';
    loadSounds();
}

async function playSound(id) {
    await apiPost(`/api/sounds/${id}/play`);
}

async function deleteSound(id) {
    if (confirm('Удалить звук?')) {
        await apiDelete(`/api/sounds/${id}`);
        loadSounds();
    }
}

async function stopAllSounds() {
    await apiPost('/api/sounds/stop');
}

// ============ НАСТРОЙКИ ============
async function loadSettings() {
    const settings = await apiGet('/api/settings');
    document.getElementById('setting-port').value = settings.rs485_port || '/dev/serial0';
    document.getElementById('setting-baudrate').value = settings.rs485_baudrate || '115200';
    document.getElementById('setting-device-id').value = settings.rs485_device_id || '16';
}

async function saveSettings() {
    await apiPut('/api/settings/rs485_port', {value: document.getElementById('setting-port').value});
    await apiPut('/api/settings/rs485_baudrate', {value: document.getElementById('setting-baudrate').value});
    await apiPut('/api/settings/rs485_device_id', {value: document.getElementById('setting-device-id').value});
    await apiPost('/api/settings/reconnect');
    alert('Настройки сохранены и применены!');
}

// ============ ЭКСТРЕННАЯ ОСТАНОВКА ============
async function emergencyStop() {
    if (confirm('Остановить все сценарии и выключить все выходы?')) {
        await apiPost('/api/scenarios/stop_all');
        await apiPost('/api/sounds/stop');
        for (let i = 0; i < 15; i++) {
            await apiPost('/api/control/output', {pin: i, state: 0});
            await apiPost('/api/control/pwm', {pin: i, power: 0});
        }
        alert('Всё остановлено!');
    }
}

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    connectWebSocket();
    loadDevices();

    document.getElementById('emergency-stop').addEventListener('click', emergencyStop);
    document.getElementById('add-device-btn').addEventListener('click', () => showDeviceModal());
    document.getElementById('save-device-btn').addEventListener('click', saveDevice);
    document.getElementById('cancel-device-btn').addEventListener('click', closeDeviceModal);
    document.getElementById('new-scenario-btn').addEventListener('click', newScenario);
    document.getElementById('save-scenario-btn').addEventListener('click', saveScenario);
    document.getElementById('close-editor-btn').addEventListener('click', closeEditor);
    document.getElementById('save-action-btn').addEventListener('click', saveAction);
    document.getElementById('cancel-action-btn').addEventListener('click', closeActionModal);
    document.getElementById('upload-sound-btn').addEventListener('click', () => document.getElementById('sound-upload').click());
    document.getElementById('sound-upload').addEventListener('change', uploadSound);
    document.getElementById('stop-all-sounds-btn').addEventListener('click', stopAllSounds);
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('test-scenario-btn').addEventListener('click', () => {
        if (state.currentScenario?.id) {
            startScenario(state.currentScenario.id);
        } else {
            alert('Сначала сохраните сценарий!');
        }
    });
});
