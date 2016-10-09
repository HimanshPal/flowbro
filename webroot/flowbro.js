let documentationModeIterator = 0
const eventQueue = []
const eventLog = []
const state = {}
var filterKey = undefined
var filterIds = []

var keyAliases = {} // https://github.com/MarianoGappa/flowbro/issues/21

const init = (configFile) => {
    if (!_(`init_script_${configFile}`)) {
        const element = document.createElement('script')
        element.setAttribute('id', `init_script_${configFile}`)
        element.setAttribute('src', `configs/${configFile}.js`)
        element.setAttribute('async', false)
        document.head.appendChild(element)
    }
}

const log = (message, _color, from, to, json, key) => {
    const colors = {
        'severe':'#E53A40',
        'error': '#E53A40',
        'warning': '#FFBC42',
        'info': 'inherit',
        'trace': '#6E7783',
        'debug': '#6E7783',
        'happy': '#2f751b',
        'default': 'inherit'
    }

    const fromId = safeId('component_' + from)
    const toId = safeId('component_' + to)

    const color = colors[_color] || colors['default']
    const isFlyingMessage = typeof from !== 'undefined' && typeof to !== 'undefined'
    const keyWrapper = '<span class="key-wrapper"></span>'
    const header = isFlyingMessage ? `<div class='log-header'>` + keyWrapper + minibox(fromId, from) + `<span> → </span>` + minibox(toId, to) + `</div>` : ''

    const prettyJson = typeof json !== 'undefined' ? '<pre>' + syntaxHighlight(json) + '</pre>' : '';

    const element = document.createElement('span')
    element.id = 'log_' + guid()
    element.className = 'logline'
    element.style.color = color
    element.innerHTML = header + `<div class='log-content'>` + message + '<br/>' + prettyJson + '</div>'
    element.dataset.key = key
    element.dataset.from = fromId
    element.dataset.to = toId

    if (!isFlyingMessage) {
        element.dataset.always = 'true'
    }

    _('#log').insertBefore(element, _('#log').firstChild)

    if (isFlyingMessage && typeof key !== 'undefined') {
        addFilteringKey(key, _('#' + element.id + ' .key-wrapper'), false)
    }

    // hide if being filtered out
    if (isFlyingMessage) {
        if ((filterKey && filterKey != key) || (filterIds.length && filterIds.indexOf(fromId) == -1 && filterIds.indexOf(toId) == -1)) {
            element.style.display = 'none'
        }
    }

    while (_('#log').children.length > 1000) {
        _('#log').removeChild(_('#log').lastElementChild)
    }
}

const updateFilters = () => {
    if (filterKey || filterIds.length) {
        __('.logline:not([data-always])').forEach((e) => e.style.display = 'none')
        __('.moon').forEach((e) => e.style.display = 'none')

        const fKeySel = filterKey ? `[data-key='${filterKey}']` : ''
        const fIdsSel = filterIds.length
            ?
                filterIds.map((i) => `.logline[data-from='${i}']${fKeySel}, .logline[data-to='${i}']${fKeySel}`).join(', ')
            :
                `.logline${fKeySel}`

        __(fIdsSel).forEach((e) => e.style.display = 'block')
        __(`.moon${fKeySel}`).forEach((e) => e.style.display = 'inline-block')

        // init filter section
        while (_('#filter-content').firstChild) { _('#filter-content').removeChild(_('#filter-content').firstChild) }
        _('#filter-content').innerHTML = "<span>Showing only:<span>";
        if (filterKey) addFilteringKey(filterKey, _('#filter-content'), true)
        filterIds.forEach((i) => { addFilteringID(i, _('#filter-content'), true) })
        _('#filter').style.display = 'block'

        return
    }

    _('#filter').style.display = 'none'
    __('.logline').forEach((e) => e.style.display = 'block')
    __('.moon').forEach((e) => e.style.display = 'inline-block')
}

const addFilteringKey = (key, parent, addListener) => {
    const rgb = keyToRGBA(key)

    const filteringKey = document.createElement('span')
    filteringKey.className = 'filtering-key'
    filteringKey.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    parent.appendChild(filteringKey)

    // filtering listener
    if (addListener) {
        filteringKey.onclick = function () {
            filterKey = undefined
            parent.removeChild(this)
            updateFilters()
        }
    }

    // Create tooltip
    const tooltip = document.createElement('span')
    tooltip.className = 'tooltip'
    tooltip.innerHTML = textLimit(key, 20)
    filteringKey.appendChild(tooltip)
}

const addFilteringID = (id, parent, addListener) => {
    const color = _('#' + id).style.backgroundColor
    const safeLabel = textLimit(_('#' + id + " span").innerHTML, 20)

    const filteringID = document.createElement('span')
    filteringID.className = 'filtering-id'
    filteringID.style.background = color
    filteringID.innerHTML = safeLabel
    parent.appendChild(filteringID)

    // filtering listener
    if (addListener) {
        filteringID.onclick = function () {
            filterIds.splice(filterIds.indexOf(id), 1)
            parent.removeChild(this)
            updateFilters()
        }
    }
}

const run = (timeout) => {
    if (typeof config !== 'undefined') {
        if (brokersOverride) {
            config.serverConfig.brokers = brokersOverride
            log(`Overriding brokers to [${brokersOverride}]`)
        }
        if (grep) {
            config.serverConfig.grep = grep
            config.serverConfig.offset = String(offset)
            log(`Grepping messages for [${grep}], with an offset of [${offset}]`)
        }
        doRun()
    } else if (timeout > 0) {
        console.log("not ready; retrying...")
        window.setTimeout(() => run(timeout - 1), 50)
    } else {
        log('Did you add .js to it? (you shouldn\'t)', 'error')
        log('Is the ?config=xxx filename wrong?', 'error')
        log('Did you break the JSON syntax?', 'error')
        log('Cannot load configuration file', 'error')
        _('#title').innerHTML = 'Flowbro is drunk :('
    }
}

const doRun = () => {
    _('#title').innerHTML = textLimit(config.title, 25)
    loadComponents(config)

    window.setInterval(() => showNextUiEvent(), config.eventSeparationIntervalMilliseconds)

    if (!config.documentationMode) {
        openWebSocket()
        // _('#rest').innerHTML = '<button onclick="javascript:replayEventLog()">Replay</button><button onclick="javascript:cleanEventLog()">Clear</button>'
    } else {
        // _('#rest').innerHTML = '<button onclick="javascript:resetDocumentationMode()">Reset</button><button onclick="javascript:mockPoll()">Next</button>'
    }
}

const showNextUiEvent = () => {
    if (eventQueue.length == 0) {
        return
    }

    const event = eventQueue.shift()

    if (event.eventType == 'message') {
        const safeSourceId = safeId(event.sourceId)
        const safeTargetId = safeId(event.targetId)

        animateFromTo(
            _(`[id='component_${safeSourceId}']`),
            _(`[id='component_${safeTargetId}']`),
            event.quantity ? event.quantity : 1,
            event.key
        )
    }
    if (typeof event.logs !== 'undefined') {
        for (let i in event.logs) {
            log(event.logs[i].text, event.logs[i].color, event.sourceId, event.targetId, i == 0 ? event.json : undefined, event.key)
        }
    } else if (event.text) {
        log(event.text, event.color, event.sourceId, event.targetId, event.json, event.key)
    }

    // Save enqueued animation into event log; keep it <= 100 events
    if (!config.documentationMode) {
        eventLog.push([event])
        if (eventLog.length > 100)
            eventLog.shift()
        _('#event-log').innerHTML = `${eventLog.length} events logged`
    }
}

const openWebSocket = () => {
    const wsUrl = "ws://" + config.webSocketAddress + "/ws"
    const ws = new WebSocket(wsUrl)

    ws.onopen = (event) => {
        log(`WebSocket open on [${wsUrl}]!`, 'happy')
        try {
            ws.send(JSON.stringify(config.serverConfig))
            log("Sent configurations to server successfully!", 'happy')
        } catch(e) {
            log("Server is drunk :( can't send him configurations!", 'error')
            console.log(e)
        }
    }

    ws.onmessage = (message) => {
        if (!config.documentationMode) {
            consumedMessages = []
            if (message.data.trim()) {
                lines = cleanArray(message.data.trim().split(/\n/))
                for (i in lines) {
                    try {
                        maybeResult = JSON.parse(lines[i])

                        consumedMessages.push(maybeResult)
                    } catch (e) {
                        console.log(`Couldn't parse this as JSON: ${lines[i]}`, "\nError: ", e)
                    }
                }
            }

            processUiEvents(consumedMessagesToEvents(consumedMessages))
        } else if (!config.hideIgnoredMessages) {
            console.log('Ignored incoming message', message)
            log('Ignored incoming message.', 'debug')
        }
    }

    ws.onclose = (event) => log("WebSocket closed!", 'error')
    ws.onerror = (event) => log(`WebSocket had error! ${event}`, 'error')
}

const processUiEvents = (events) => { for (event of events) {
    if (config.documentationMode)
        eventQueue.push(event)
    else
        aggregateEventOnEventQueue(event)
} }

const aggregateEventOnEventQueue = (event) => {
    const indexOfSimilarMessage = (event, eventQueue) => {
        let index = undefined
        eventQueue.forEach((v, i) => {
            if (v.sourceId == event.sourceId && v.targetId == event.targetId && v.key == event.key)
                index = i
        })
        return index
    }

    // if it's an A -> B type of event
    if (event.eventType == 'message') {
        const i = indexOfSimilarMessage(event, eventQueue)

        // if a message from the same A -> B exists, +1 its quantity and add its log if present
        if (typeof i !== 'undefined') {
            eventQueue[i].quantity = eventQueue[i].quantity ? eventQueue[i].quantity + 1 : 2
            if (typeof event.text !== 'undefined') eventQueue[i].logs.push(event)

        // if it's the first message from A -> B, add it to the queue and start a collection of logs for it
        } else {
            let aggregatedEvent = event
            if (typeof event.text !== 'undefined') {
                if (typeof event.logs !== 'undefined') {
                    aggregatedEvent.logs.push(event)
                } else {
                    aggregatedEvent.logs = [event]
                }
            }
            eventQueue.push(aggregatedEvent)
        }

    // if it's a log type of event
    } else if (event.eventType == 'log') {
        let lastId = eventQueue.length - 1

        // if the last event on the queue is a log event, add this log to it
        if (eventQueue[lastId] && eventQueue[lastId].eventType == 'log') {
            eventQueue[lastId].logs.push(event)

        // otherwise, push a new event and start a collection of logs for it
        } else {
            let aggregatedEvent = event
            if (typeof event.logs !== 'undefined') {
                aggregatedEvent.logs.push(event)
            } else {
                aggregatedEvent.logs = [event]
            }
            eventQueue.push(aggregatedEvent)
        }
    }
}

const cleanEventLog = () => { eventLog.length = 0; log('-- Replay event log is now empty --', 'debug'); }
const replayEventLog = () => {
    if (eventLog.length > 0) {
        config.documentationMode = true
        documentationModeIterator = 0
        config.documentationSteps = eventLog
        eventQueue.length = 0
        refreshDocumentationModeStepCount()
        log('-- Replay event log mode; ignoring real-time messages --', 'happy')
        _('#rest').innerHTML = '<button onclick="javascript:resetDocumentationMode()">|&lt;&lt;</button><button onclick="javascript:mockPoll()">&gt;</button><button onclick="javascript:restoreRealTime()">Back</button>'
    } else {
        log('-- Replay event log is empty --', 'error')
    }
}
const restoreRealTime = () => {
    config.documentationSteps.length = 0
    documentationModeIterator = 0
    config.documentationMode = false
    eventLog.length = 0
    log('-- Back to real-time mode --')
    _('#rest').innerHTML = '<button onclick="javascript:replayEventLog()">Replay</button><button onclick="javascript:cleanEventLog()">Clear</button>'
}

const resetDocumentationMode = () => {
    documentationModeIterator = 0
    refreshDocumentationModeStepCount()
    log('-- reset --', 'debug')
}

const mockPoll = () => {
    newEvents = config.documentationSteps[documentationModeIterator] ? config.documentationSteps[documentationModeIterator++] : []
    refreshDocumentationModeStepCount()
    processUiEvents(newEvents)
}
const refreshDocumentationModeStepCount = () => {
    _('#event-log').style.display = 'block';
    _('#event-log').innerHTML = `${documentationModeIterator}/${config.documentationSteps.length} events`
}

const consumedMessagesToEvents = (consumedMessages) => {
    consumedMessages.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0)

    const events = []
    for (let i in consumedMessages) {
        if (consumedMessages[i]) {
            const newEvents = config.logic(consumedMessages[i], log, state)
            if (newEvents.length == 0 && !config.hideIgnoredMessages) {
                log(`Ignoring event:<br/><pre>` + syntaxHighlight(JSON.parse(consumedMessages[i].value)) + '</pre>', 'debug')
            }
            for (let j in newEvents) {
                try {
                    newEvents[j].json = JSON.parse(consumedMessages[i].value) // json specific
                } finally {}

                // https://github.com/MarianoGappa/flowbro/issues/21
                updateAliases(newEvents[j], keyAliases)
                key = newEvents[j].key ? newEvents[j].key : consumedMessages[i].key
                newEvents[j].key = resolveKeyAliases(key, keyAliases)

                events.push(newEvents[j])
            }
        }
    }
    return events
}

// https://github.com/MarianoGappa/flowbro/issues/21
const updateAliases = (event, keyAliases) => {
    if (event.keyAlias && event.key) {
        key = event.key
        if (keyAliases[key]) {
            key = keyAliases[key]
        }

        keyAliases[event.keyAlias] = key
    }
}
// https://github.com/MarianoGappa/flowbro/issues/21
const resolveKeyAliases = (key, keyAliases) => {
    return key && keyAliases[key] ? keyAliases[key] : key
}


const loadComponents = (config) => {
    let colorRing = colorGenerator(config.colourPalette)
    for (let i in config.components) {
        const component = config.components[i]
        const safeComponentId = safeId(component.id)

        let element = document.createElement('div')
        element.id = `component_${safeComponentId}`
        element.className = 'component'
        element.dataset.clicked = -1

        _('#container').appendChild(element)

        if (component.backgroundColor) {
            element.style.backgroundColor = component.backgroundColor
        }

        element.style.width = component.width ? component.width : "150px"
        element.style.height = component.height ? component.height : "100px"

        const position = componentPosition(config.components, i)
        element.style.left = position.left
        element.style.top = position.top

        if (component.img) {
            const img = document.createElement('img')
            img.src = config.images[component.img]
            element.appendChild(img)
        } else {
            const title = document.createElement('span')
            title.className = 'component_title'
            title.innerHTML = component.id
            element.appendChild(title)
            element.style.backgroundColor = component.backgroundColor ? component.backgroundColor : colorRing.next().value
            title.style.marginTop = "-" + (parseInt(title.offsetHeight) / 2) + "px"
            title.style.width = parseInt(element.style.width) - 20 - 2 // 20 = padding
        }

        // filtering handler
        element.onclick = function () {
            element.dataset.clicked = element.dataset.clicked  * -1
            if (element.dataset.clicked == 1 && filterIds.indexOf(element.id) == -1) {
                filterIds.push(element.id)
            } else {
                filterIds.splice(filterIds.indexOf(element.id), 1);
            }

            //https://github.com/MarianoGappa/flowbro/issues/20
            _('#component-info').innerHTML = component.info ? minibox(element.id, component.id) + "<span> → </span>" + component.info : ''

            updateFilters()
        }

        // Moon holder
        let moonHolder = document.createElement('div')
        moonHolder.id = `${element.id}_moon_holder`
        moonHolder.className = 'moon-holder'

        _('#container').appendChild(moonHolder)
        moonHolder.style.left = parseInt(element.style.left)
        moonHolder.style.width = 300
        moonHolder.style.top = parseInt(element.style.top) + parseInt(element.style.height)
    }
}

const animateFromTo = (source, target, quantity, key) => {
    const element = document.createElement('div')
    element.id = 'anim_' + guid()
    element.className = 'detached message'

    _('#container').appendChild(element)
    element.style.top = parseInt(source.offsetTop) + (parseInt(source.offsetHeight) / 2) - (parseInt(element.offsetHeight) / 2)
    element.style.left = parseInt(source.offsetLeft) + (parseInt(source.offsetWidth) / 2) - (parseInt(element.offsetWidth) / 2)

    element.style.zIndex = -1

    var rgb = undefined
    if (config.colorBasedOnKey && typeof key !== 'undefined' && key !== '') {
        rgb = keyToRGBA(key)
    }

    if (quantity > 1) {
        const q = document.createElement('h2')
        q.innerHTML = quantity
        element.appendChild(q)
    }

    if (typeof rgb !== 'undefined') {
        element.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    } else {
        element.style.background = 'url(images/message.gif)'
    }
    element.style.backgroundSize = 'cover'

    const newTop = target.offsetHeight / 2 - parseInt(element.offsetHeight) / 2 + parseInt(target.offsetTop)
    const newLeft = target.offsetWidth / 2 - parseInt(element.offsetWidth) / 2 + parseInt(target.offsetLeft)

    style = document.createElement('style')
    style.type = 'text/css'
    const styleId = `style_${guid()}`
    const length = config.animationLengthMilliseconds
    style.appendChild(document.createTextNode(`.${styleId} { top: ${newTop}px !important; left: ${newLeft}px !important; -webkit-transition: top${length}ms, left ${length}ms; /* Safari */ transition: top ${length}ms, left ${length}ms;}`))
    document.body.appendChild(style)

    element.className = `${styleId} detached message`

    const postAnimation = (element, style, target, rgb, key) => () => {
        element.parentNode.removeChild(element)
        style.parentNode.removeChild(style)
        if (rgb) {
            addMoon(source, rgb, key)
            addMoon(target, rgb, key)
        }
    }

    window.setTimeout(postAnimation(element, style, target, rgb, key), length)
}

const addMoon = (target, rgb, key) => {
    const moonId = target.id + "_" + key
    const moonHolderId = target.id + "_moon_holder"

    if (_('#' + moonId)) {
        return
    }

    // Create moon
    const moon = document.createElement('div')
    moon.id = moonId
    moon.className = 'moon'
    moon.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    moon.dataset.key = key
    moon.dataset.to = target.id
    moon.dataset.clicked = -1

    // Hide moon if currently filtered out
    if (filterKey && filterKey != key) {
        moon.style.display = 'none'
    }

    _('#' + moonHolderId).appendChild(moon)

    // filtering listener
    moon.onclick = function () {
        moon.dataset.clicked = moon.dataset.clicked  * -1
        if (moon.dataset.clicked == 1 && filterKey != key) {
            filterKey = key
        } else {
            filterKey = undefined
        }
        updateFilters()
    };

    // Create tooltip
    const tooltip = document.createElement('span')
    tooltip.className = 'tooltip'
    tooltip.innerHTML = textLimit(key, 20)
    _('#' + moonId).appendChild(tooltip)

    // Limit to 4 moons
    // if (_('#' + moonHolderId).children.length > 4) {
    //     _('#' + moonHolderId).removeChild(_('#' + moonHolderId).children[0])
    // }
}

const componentPosition = (components, i) => {
    const defaultPositions = [
        [],
        [{left: 50, top: 50}],
        [{left: 50, top: 50}, {left: 450, top: 450}],
        [{left: 50, top: 50}, {left: 50, top: 450}, {left: 450, top: 450}],
        [{left: 50, top: 50}, {left: 50, top: 450}, {left: 450, top: 50}, {left: 450, top: 450}],
        [{left: 50, top: 250}, {left: 200, top: 50}, {left: 100, top: 450}, {left: 450, top: 220}, {left: 450, top: 450}],
    ]

    const position = {}

    if (components[i].top != undefined) {
        position.top = components[i].top
    } else if (defaultPositions[components.length] != undefined) {
        position.top = defaultPositions[components.length][i].top
    } else {
        position.top = 0
    }

    if (components[i].left != undefined) {
        position.left = components[i].left
    } else if (defaultPositions[components.length] != undefined) {
        position.left = defaultPositions[components.length][i].left
    } else {
        position.left = 0
    }

    return position
}

// Brokers query param
let brokersOverride = undefined
const brokerOverrideParam = getParameterByName('brokers')
if (brokerOverrideParam) {
    brokersOverride = brokerOverrideParam
}

// Offset query param
let offset = undefined
const offsetParam = getParameterByName('offset')
if (offsetParam) {
    offset = offsetParam
}

// Grep query param
let grep = undefined
const grepParam = getParameterByName('grep')
if (grepParam) {
    grep = grepParam
    if (!offsetParam) {
        offset = -1000
    }
}

try {
    const inlineConfigParam = getParameterByName('inlineConfig', 'no_lowercase')
    if (inlineConfigParam !== null) {
        const inlineConfig = atob(inlineConfigParam)
        eval(inlineConfig)
    }
} finally {
    if (typeof config === 'undefined') {
        init(getParameterByName('config') || 'config-example')
    }
}
