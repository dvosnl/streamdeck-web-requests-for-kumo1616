# streamdeck-web-requests
An Elgato Stream Deck plugin for sending web requests.

## Features

### HTTP Request
Send arbitrary HTTP requests with configurable URL, method, headers, and body.

### WebSocket Message
Send messages via WebSocket connections.

### Destination Select (NEW)
Select a destination for matrix/routing control. This action:
- Sets a destination ID that is stored globally
- Does NOT send any HTTP request
- Causes Source buttons to blink, indicating they are ready to be triggered
- The selected destination remains active until another is chosen
- Visual feedback: selected destination shows with blinking indicator

### Source Trigger (NEW)
Trigger a source that sends an HTTP request with placeholder support. This action:
- Sends an HTTP request when pressed
- Supports `{dest}` and `{src}` placeholders in URL and body
- Requires a destination to be selected first
- Visual feedback: blinks when a destination is selected

## Placeholder Usage

Use placeholders in the Source Trigger URL and body fields:
- `{dest}` - Replaced with the currently selected Destination ID
- `{src}` - Replaced with the Source ID configured in the action settings

### Example URL
```
http://device/api/route?dest={dest}&src={src}
```

If Destination ID `2` is selected and Source ID is `5`, the URL becomes:
```
http://device/api/route?dest=2&src=5
```

## Two-Step Routing Workflow

This plugin enables efficient matrix/routing control:

1. **Setup**: Place Destination buttons on the bottom half of your Stream Deck page, Source buttons on the top half
2. **Select Destination**: Press a Destination button - it will show visual feedback (blinking)
3. **Trigger Source**: All Source buttons start blinking to indicate they're ready. Press a Source button to execute the HTTP request with the selected destination
4. **Destination Persists**: The selected destination remains active. You can trigger multiple sources without reselecting the destination
5. **Change Destination**: Simply press a different Destination button to change the routing target

## Installation
Grab the .streamDeckPlugin file from the [releases](https://github.com/data-enabler/streamdeck-web-requests/releases/latest) page.

## Development
- Pre-requisites: [Stream Deck CLI](https://docs.elgato.com/streamdeck/cli/intro/), [Inkscape](https://inkscape.org/)
- Run the `render_images.ps1` script with Powershell or Bash to generate images
- `streamdeck link Sources/gg.datagram.web-requests.sdPlugin`
- `streamdeck restart gg.datagram.web-requests`

## Testing
- Install `test/WebRequestsTest.streamDeckProfile`
- `npm ci --prefix test`
- `node test`
- Verify that each action in the profile works when pressed

### Testing Destination/Source Flow
1. Add a Destination Select action, set Destination ID to "1"
2. Add a Source Trigger action, set Source ID to "1" and URL to `http://httpbin.org/get?dest={dest}&src={src}` with method GET
3. Press Destination button - observe blinking
4. Press Source button - request is sent with dest=1 and src=1
5. Verify the request was successful (OK indicator)
