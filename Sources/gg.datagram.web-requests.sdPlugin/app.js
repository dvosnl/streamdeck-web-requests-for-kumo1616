// Global state for destination selection and blink management
let selectedDestinationId = null;
const blinkTimers = new Map(); // context -> timer
const blinkStates = new Map(); // context -> boolean (on/off)
const actionContexts = new Map(); // context -> { type: 'destination'|'source', settings: {} }

$SD.on('connected', (jsonObj) => connected(jsonObj));

function connected(jsn) {
    // Request global settings on connect
    $SD.api.getGlobalSettings($SD.uuid);
    
    // Existing HTTP and WebSocket actions
    $SD.on('gg.datagram.web-requests.http.keyDown', (jsonObj) => sendHttp(jsonObj));
    $SD.on('gg.datagram.web-requests.websocket.keyDown', (jsonObj) => sendWebSocket(jsonObj));
    
    // New Destination and Source actions
    $SD.on('gg.datagram.web-requests.destination.keyDown', (jsonObj) => selectDestination(jsonObj));
    $SD.on('gg.datagram.web-requests.source.keyDown', (jsonObj) => triggerSource(jsonObj));
    
    // Track action contexts for blink management
    $SD.on('gg.datagram.web-requests.destination.willAppear', (jsonObj) => registerAction(jsonObj, 'destination'));
    $SD.on('gg.datagram.web-requests.source.willAppear', (jsonObj) => registerAction(jsonObj, 'source'));
    $SD.on('gg.datagram.web-requests.destination.willDisappear', (jsonObj) => unregisterAction(jsonObj));
    $SD.on('gg.datagram.web-requests.source.willDisappear', (jsonObj) => unregisterAction(jsonObj));
    
    // Handle global settings updates
    $SD.on('didReceiveGlobalSettings', (jsonObj) => handleGlobalSettings(jsonObj));
};

/**
 * Handle global settings received from Stream Deck
 * @param {Object} jsn - JSON object containing global settings
 */
function handleGlobalSettings(jsn) {
    const settings = jsn.payload?.settings || {};
    const newDestinationId = settings.selectedDestinationId || null;
    
    if (newDestinationId !== selectedDestinationId) {
        selectedDestinationId = newDestinationId;
        updateAllBlinking();
    }
}

/**
 * Register an action context when it appears
 * @param {Object} jsn - JSON object from willAppear event
 * @param {string} type - Action type ('destination' or 'source')
 */
function registerAction(jsn, type) {
    const context = jsn.context;
    const settings = jsn.payload?.settings || {};
    
    actionContexts.set(context, { type, settings });
    
    // Start blinking if destination is selected
    if (selectedDestinationId !== null) {
        startBlinking(context, type, settings);
    }
}

/**
 * Unregister an action context when it disappears
 * @param {Object} jsn - JSON object from willDisappear event
 */
function unregisterAction(jsn) {
    const context = jsn.context;
    stopBlinking(context);
    actionContexts.delete(context);
}

/**
 * Start blinking animation for a context
 * @param {string} context - Action context
 * @param {string} type - Action type ('destination' or 'source')
 * @param {Object} settings - Action settings
 */
function startBlinking(context, type, settings) {
    // Stop existing timer if any
    stopBlinking(context);
    
    // Initialize blink state
    blinkStates.set(context, true);
    
    // Update title immediately
    updateBlinkTitle(context, type, settings);
    
    // Set up blink interval (500ms)
    const timer = setInterval(() => {
        const currentState = blinkStates.get(context) || false;
        blinkStates.set(context, !currentState);
        updateBlinkTitle(context, type, settings);
    }, 500);
    
    blinkTimers.set(context, timer);
}

/**
 * Stop blinking animation for a context
 * @param {string} context - Action context
 */
function stopBlinking(context) {
    const timer = blinkTimers.get(context);
    if (timer) {
        clearInterval(timer);
        blinkTimers.delete(context);
    }
    blinkStates.delete(context);
}

/**
 * Update the title for blinking effect
 * @param {string} context - Action context
 * @param {string} type - Action type ('destination' or 'source')
 * @param {Object} settings - Action settings
 */
function updateBlinkTitle(context, type, settings) {
    const isOn = blinkStates.get(context);
    
    if (type === 'destination') {
        const destId = settings.destinationId || '';
        const isSelected = destId === selectedDestinationId;
        
        if (isSelected) {
            // Selected destination: show with indicator
            const title = isOn ? `▶ ${destId}` : `● ${destId}`;
            $SD.api.setTitle(context, title);
        } else {
            // Not selected: just show ID
            $SD.api.setTitle(context, destId);
        }
    } else if (type === 'source') {
        const srcId = settings.sourceId || '';
        // Source blinks when destination is selected
        const title = isOn ? `◆ ${srcId}` : `◇ ${srcId}`;
        $SD.api.setTitle(context, title);
    }
}

/**
 * Update blinking state for all registered actions
 */
function updateAllBlinking() {
    actionContexts.forEach((actionInfo, context) => {
        if (selectedDestinationId !== null) {
            startBlinking(context, actionInfo.type, actionInfo.settings);
        } else {
            stopBlinking(context);
            // Reset title
            if (actionInfo.type === 'destination') {
                $SD.api.setTitle(context, actionInfo.settings.destinationId || '');
            } else if (actionInfo.type === 'source') {
                $SD.api.setTitle(context, actionInfo.settings.sourceId || '');
            }
        }
    });
}

/**
 * Handle destination selection
 * @param {Object} data - Key down event data
 */
function selectDestination(data) {
    const { destinationId } = data.payload.settings;
    log('selectDestination', { destinationId });
    
    if (!destinationId) {
        showAlert(data.context);
        return;
    }
    
    // Update global state
    selectedDestinationId = destinationId;
    
    // Save to global settings for persistence
    $SD.api.setGlobalSettings($SD.uuid, {
        selectedDestinationId: destinationId
    });
    
    // Update blinking for all actions
    updateAllBlinking();
    
    showOk(data.context);
}

/**
 * Handle source trigger - replaces {dest} and {src} placeholders and sends HTTP request
 * @param {Object} data - Key down event data
 */
function triggerSource(data) {
    const { sourceId, url, method, contentType, headers, body } = data.payload.settings;
    log('triggerSource', { sourceId, url, method, selectedDestinationId });
    
    if (!url || !method || !sourceId) {
        showAlert(data.context);
        return;
    }
    
    if (selectedDestinationId === null) {
        // No destination selected
        log('No destination selected');
        showAlert(data.context);
        return;
    }
    
    // Replace placeholders in URL and body
    const processedUrl = replacePlaceholders(url, selectedDestinationId, sourceId);
    const processedBody = body ? replacePlaceholders(body, selectedDestinationId, sourceId) : null;
    
    log('Processed URL:', processedUrl);
    
    let defaultHeaders = contentType ? {
        'Content-Type': contentType
    } : {};
    let inputHeaders = {};

    if (headers) {
        const headersArray = headers.split(/\n/);

        for (let i = 0; i < headersArray.length; i += 1) {
            if (headersArray[i].includes(':')) {
                const [headerItem, headerItemValue] = headersArray[i].split(/:(.*)/);
                const trimmedHeaderItem = headerItem.trim();
                const trimmedHeaderItemValue = headerItemValue.trim();

                if (trimmedHeaderItem) {
                    inputHeaders[trimmedHeaderItem] = trimmedHeaderItemValue;
                }
            }
        }
    }

    const fullHeaders = {
        ...defaultHeaders,
        ...inputHeaders
    };

    fetch(
        processedUrl,
        {
            cache: 'no-cache',
            headers: fullHeaders,
            method,
            body: ['GET', 'HEAD'].includes(method) ? undefined : processedBody,
        })
        .then(checkResponseStatus)
        .then(() => showOk(data.context))
        .catch(err => {
            showAlert(data.context);
            logErr(err);
        });
}

/**
 * Replace {dest} and {src} placeholders in a string
 * @param {string} str - String containing placeholders
 * @param {string} destId - Destination ID to replace {dest}
 * @param {string} srcId - Source ID to replace {src}
 * @returns {string} String with placeholders replaced
 */
function replacePlaceholders(str, destId, srcId) {
    return str
        .replace(/\{dest\}/g, destId)
        .replace(/\{src\}/g, srcId);
}

/**
 * @param {{
 *   context: string,
 *   payload: {
 *     settings: {
 *       url?: string,
 *       method?: string,
 *       contentType?: string|null,
 *       headers?: string|null,
 *       body?: string|null,
 *     }
 *   },
 * }} data
 */
function sendHttp(data) {
    const { url, method, contentType, headers, body } = data.payload.settings;
    log('sendHttp', { url, method, contentType, headers, body });

    let defaultHeaders = contentType ? {
        'Content-Type':  contentType
    } : {};
    let inputHeaders = {};

    if (headers) {
        const headersArray = headers.split(/\n/);

        for (let i = 0; i < headersArray.length; i += 1) {
            if (headersArray[i].includes(':')) {
                const [headerItem, headerItemValue] = headersArray[i].split(/:(.*)/);
                const trimmedHeaderItem = headerItem.trim();
                const trimmedHeaderItemValue = headerItemValue.trim();

                if (trimmedHeaderItem) {
                    inputHeaders[trimmedHeaderItem] = trimmedHeaderItemValue;
                }
            }
        }
    }

    const fullHeaders = {
        ...defaultHeaders,
        ...inputHeaders
    }

    log(fullHeaders);

    if (!url || !method) {
        showAlert(data.context);
        return;
    }
    fetch(
        url,
        {
            cache: 'no-cache',
            headers: fullHeaders,
            method,
            body: ['GET', 'HEAD'].includes(method) ? undefined : body,
        })
        .then(checkResponseStatus)
        .then(() => showOk(data.context))
        .catch(err => {
            showAlert(data.context);
            logErr(err);
        });
}

/**
 * @param {{
 *   context: string,
 *   payload: {
 *     settings: {
 *       url?: string,
 *       body?: string|null,
 *     }
 *   },
 * }} data
 */
function sendWebSocket(data) {
    const { url, body } = data.payload.settings;
    log('sendWebSocket', { url, body });
    if (!url || !body) {
        showAlert(data.context);
        return;
    }
    const ws = new WebSocket(url);
    ws.onerror = err => {
        showAlert(data.context);
        logErr(new Error('WebSocket error occurred'));
    };
    ws.onclose = function(evt) { onClose(this, evt); };
    ws.onopen = function() {
        onOpen(this);
        const start = performance.now();
        ws.send(body);
        const readyCloseInterval = setInterval(function() {
            if (ws.bufferedAmount == 0) {
                ws.close();
                showOk(data.context);
                clearInterval(readyCloseInterval);
            }
            else if ((performance.now() - start) > 3000) {
                ws.close();
                showAlert(data.context);
                logErr(new Error('WebSocket send timeout'));
                clearInterval(readyCloseInterval);
            }
        }, 50);
    };
}

/**
 * @param {void | Response} resp
 * @returns {Promise<Response>}
 */
async function checkResponseStatus(resp) {
    if (!resp) {
        throw new Error();
    }
    if (!resp.ok) {
        throw new Error(`${resp.status}: ${resp.statusText}\n${await resp.text()}`);
    }
    return resp;
}

/**
 * @param {WebSocket} ws
 */
function onOpen(ws) {
    log(`Connection to ${ws.url} opened`);
}

/**
 * @param {WebSocket} ws
 * @param {CloseEvent} evt
 */
function onClose(ws, evt) {
    log(`Connection to ${ws.url} closed:`, evt.code, evt.reason);
}

/**
 * @param {string} context
 */
function showOk(context) {
    $SD.api.showOk(context);
}

/**
 * @param {string} context
 */
function showAlert(context) {
    $SD.api.showAlert(context);
}

/**
 * @param {...unknown} msg
 */
function log(...msg) {
    console.log(...msg);
    $SD.api.logMessage(msg.map(stringify).join(' '));
}

/**
 * @param {...unknown} msg
 */
function logErr(...msg) {
    console.error(...msg);
    $SD.api.logMessage(msg.map(stringify).join(' '));
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function stringify(input) {
    if (typeof input !== 'object' || input instanceof Error) {
        return input.toString();
    }
    return JSON.stringify(input, null, 2);
}
