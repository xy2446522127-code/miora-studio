"""Manifest entry for the browser-assisted Gemini plugin.

The 花海 backend owns browser launch and download capture so this module never
touches browser cookies or account secrets.
"""

if __name__ == "__main__":
    print('{"ok":true,"status":"browser_assisted"}')
