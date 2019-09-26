/**
 * Poor man's shlex.
 *
 * Split the spring by spaces with support of quoting strings with spaces and escaping any symbol.
 *
 */
export default function shlex(input: string): string[] {
    let token = "";
    let res = [];
    let state = {
        inQuotes: false,
        escaped: false,
        ptr: 0
    };
    let currentChar;

    function flushToken() {
        if (token)
            res.push(token);
        token = "";
    }

    while (state.ptr < input.length) {
        currentChar = input[state.ptr];
        if (state.escaped) {
            token += currentChar;
            state.escaped = false;
        } else if ("\\" === currentChar) {
            state.escaped = true;
        } else if (state.inQuotes) {
            if ("\"" === currentChar) {
                state.inQuotes = false;
                flushToken();
            } else {
                token += currentChar;
            }
        } else {
            if ("\"" === currentChar) {
                state.inQuotes = true;
                flushToken();
            } else if (/\s/.test(currentChar)) {
                flushToken();
            } else {
                token += currentChar;
            }
        }
        state.ptr++;
    }

    flushToken();
    return res
}
