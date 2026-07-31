param(
    [Parameter(Mandatory = $true)]
    [string]$RequestPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

if (-not ('HuahaiBrowserNative' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class HuahaiBrowserNative
{
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    public static void Click(int x, int y)
    {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
}
'@
}

function Write-HandoffResult {
    param(
        [bool]$Ok,
        [string]$Message,
        [hashtable]$Extra = @{},
        [int]$ExitCode = 0
    )
    $result = [ordered]@{
        ok = $Ok
        message = $Message
    }
    foreach ($key in $Extra.Keys) {
        $result[$key] = $Extra[$key]
    }
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Write-Output ($result | ConvertTo-Json -Compress -Depth 8)
    exit $ExitCode
}

function Get-EdgeWindow {
    $process = Get-Process msedge -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Sort-Object StartTime |
        Select-Object -Last 1
    if (-not $process) {
        throw '没有找到可见的 Microsoft Edge 窗口。请先打开 Edge 并保持窗口可用。'
    }
    return $process
}

function Get-EdgeRoot {
    param($Process)
    return [System.Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
}

function Get-AllDescendants {
    param($Root)
    return $Root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
}

function Find-FirstElement {
    param(
        $Root,
        [scriptblock]$Predicate
    )
    $items = Get-AllDescendants $Root
    $matches = @()
    for ($index = 0; $index -lt $items.Count; $index += 1) {
        $item = $items.Item($index)
        try {
            if (& $Predicate $item) {
                $score = 0
                $rect = $item.Current.BoundingRectangle
                if (-not $item.Current.IsOffscreen) { $score += 100 }
                if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) { $score += 25 }

                # Edge can keep the accessibility tree of a sleeping tab next
                # to the active page. Controls in the active web content are
                # parented below a Pane, while stale tab controls can hang
                # directly below the browser Window. Prefer the active tree so
                # clicks never land on an invisible duplicate composer.
                $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
                $ancestor = $item
                for ($level = 0; $level -lt 16 -and $ancestor; $level += 1) {
                    $ancestor = $walker.GetParent($ancestor)
                    if (-not $ancestor) { break }
                    if ($ancestor.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window) {
                        break
                    }
                    if ($ancestor.Current.ControlType -eq [System.Windows.Automation.ControlType]::Pane) {
                        $score += 200
                        break
                    }
                }
                $matches += [pscustomobject]@{ Element = $item; Score = $score; Order = $index }
            }
        } catch {
            continue
        }
    }
    if (@($matches).Count -eq 0) {
        return $null
    }
    return (@($matches) | Sort-Object Score, Order -Descending | Select-Object -First 1).Element
}

function Wait-ForElement {
    param(
        [scriptblock]$RootProvider,
        [scriptblock]$Predicate,
        [int]$TimeoutSeconds = 30
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $root = & $RootProvider
            if ($root) {
                $item = Find-FirstElement $root $Predicate
                if ($item) {
                    return $item
                }
            }
        } catch {
            # Chromium replaces accessibility nodes while loading; retry against
            # the fresh tree instead of treating a stale element as a failure.
        }
        Start-Sleep -Milliseconds 250
    }
    return $null
}

function Invoke-OrClick {
    param($Element)
    if (-not $Element) {
        throw '目标控件不存在'
    }
    $pattern = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        $pattern.Invoke()
        return
    }
    $selection = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selection)) {
        $selection.Select()
        return
    }
    $expand = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$expand)) {
        if ($expand.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed) {
            $expand.Expand()
            return
        }
        if ($expand.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) {
            return
        }
        # Chromium exposes menu items as ExpandCollapse LeafNode controls.
        # They still need a physical click to launch the native file picker.
    }
    $rect = $Element.Current.BoundingRectangle
    if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) {
        throw "控件不可点击：$($Element.Current.Name)"
    }
    [HuahaiBrowserNative]::Click(
        [int][Math]::Round($rect.Left + ($rect.Width / 2)),
        [int][Math]::Round($rect.Top + ($rect.Height / 2))
    )
}

function Select-OfficialTab {
    param(
        $Root,
        [string]$PluginId
    )
    $tabs = $Root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.PropertyCondition]::new(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::TabItem
        )
    )
    $tabMatches = @()
    for ($index = 0; $index -lt $tabs.Count; $index += 1) {
        $tab = $tabs.Item($index)
        $name = [string]$tab.Current.Name
        if ($PluginId -eq 'gemini-creator' -and $name -match 'Gemini') {
            $tabMatches += $tab
        } elseif ($PluginId -eq 'gpt-creator' -and $name -match '^ChatGPT') {
            $tabMatches += $tab
        }
    }
    if (-not $tabMatches.Count) {
        throw '官方网页已请求打开，但没有找到对应的 Edge 标签页。'
    }
    Invoke-OrClick $tabMatches[-1]
}

function Find-FileDialog {
    $desktop = [System.Windows.Automation.AutomationElement]::RootElement
    # Chromium's file dialog may be parented under the browser window instead
    # of exposed as a direct desktop child, so search the complete desktop tree.
    $windows = $desktop.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.PropertyCondition]::new(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Window
        )
    )
    for ($index = 0; $index -lt $windows.Count; $index += 1) {
        $window = $windows.Item($index)
        $name = [string]$window.Current.Name
        $className = [string]$window.Current.ClassName
        if ($className -eq '#32770' -and $name -match '^(打开|Open|选择文件|Choose files)') {
            return $window
        }
    }
    return $null
}

function Set-FileDialogPaths {
    param(
        $Dialog,
        [string[]]$Files
    )
    if (-not $Files.Count) {
        throw '没有可上传的参考图。'
    }
    $folders = @($Files | ForEach-Object { [IO.Path]::GetDirectoryName($_) } | Select-Object -Unique)
    if ($folders.Count -ne 1) {
        throw '浏览器接力暂存文件必须位于同一目录。'
    }

    # Windows 11's modern file picker exposes an unreliable ValuePattern in
    # Windows PowerShell 5.1. Keyboard navigation is stable, and using the
    # clipboard avoids locale-dependent key translation for Chinese paths.
    $previousClipboard = $null
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsData([System.Windows.Forms.DataFormats]::GetDataFormat('DataObject').Name)) {
            $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
        } else {
            $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
        }
    } catch {
        $previousClipboard = $null
    }
    try {
        $shell = New-Object -ComObject WScript.Shell
        if (-not $shell.AppActivate([string]$Dialog.Current.Name)) {
            throw '无法激活 Windows 文件选择窗口。'
        }
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.Clipboard]::SetText($folders[0])
        [System.Windows.Forms.SendKeys]::SendWait('^l')
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        Start-Sleep -Milliseconds 500

        $quotedNames = ($Files | ForEach-Object { '"' + [IO.Path]::GetFileName($_) + '"' }) -join ' '
        [System.Windows.Forms.Clipboard]::SetText($quotedNames)
        [System.Windows.Forms.SendKeys]::SendWait('%n')
        [System.Windows.Forms.SendKeys]::SendWait('^a')
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    } finally {
        Start-Sleep -Milliseconds 150
        if ($previousClipboard) {
            try {
                [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
            } catch {
                # Clipboard restoration is best effort and must not mask the
                # attachment result.
            }
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Find-FileDialog)) {
            return
        }
        Start-Sleep -Milliseconds 200
    }
    throw '文件选择窗口没有在提交附件后关闭。'
}

function Find-PromptEditor {
    param(
        [scriptblock]$RootProvider,
        [string]$PluginId,
        [int]$TimeoutSeconds = 30
    )
    return Wait-ForElement $RootProvider {
        param($item)
        if ($item.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) {
            return $false
        }
        if ($PluginId -eq 'gpt-creator') {
            return $item.Current.AutomationId -eq 'prompt-textarea' -or $item.Current.Name -match 'ChatGPT'
        }
        return $item.Current.Name -match 'Gemini.*输入提示|为 Gemini 输入提示|Enter a prompt'
    } $TimeoutSeconds
}

function Get-ComposerRoot {
    param(
        $Editor,
        [string]$PluginId
    )
    $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
    $candidate = $Editor
    for ($level = 0; $level -lt 12 -and $candidate; $level += 1) {
        $className = [string]$candidate.Current.ClassName
        if ($PluginId -eq 'gemini-creator' -and $className -match '(^| )text-input-field( |$)') {
            return $candidate
        }
        if ($PluginId -eq 'gpt-creator' -and $className -match 'composer|prompt') {
            $descendants = Get-AllDescendants $candidate
            $hasAdd = $false
            $hasSubmit = $false
            for ($index = 0; $index -lt $descendants.Count; $index += 1) {
                $item = $descendants.Item($index)
                if ($item.Current.AutomationId -eq 'composer-plus-btn') { $hasAdd = $true }
                if ($item.Current.AutomationId -eq 'composer-submit-button') { $hasSubmit = $true }
            }
            if ($hasAdd -or $hasSubmit) {
                return $candidate
            }
        }
        $candidate = $walker.GetParent($candidate)
    }
    return $Editor
}

function Get-AttachmentSnapshot {
    param(
        [scriptblock]$RootProvider,
        [string]$PluginId,
        [string[]]$Files
    )
    $editor = Find-PromptEditor $RootProvider $PluginId 5
    if (-not $editor) {
        return @{ generic = 0; named = 0 }
    }
    $composer = Get-ComposerRoot $editor $PluginId
    $items = Get-AllDescendants $composer
    $expected = @($Files | ForEach-Object { [IO.Path]::GetFileName($_).ToLowerInvariant() })
    $visibleNames = New-Object System.Collections.Generic.List[string]
    $generic = 0
    for ($index = 0; $index -lt $items.Count; $index += 1) {
        $item = $items.Item($index)
        $name = [string]$item.Current.Name
        if ($name) {
            $visibleNames.Add($name.ToLowerInvariant())
        }
        if ($item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Image -and
            $name -match '^(attachment|附件|image|图片)$') {
            $rect = $item.Current.BoundingRectangle
            if (-not $rect.IsEmpty -and $rect.Width -ge 32 -and $rect.Height -ge 32) {
                $generic += 1
            }
        }
    }
    $joined = $visibleNames -join "`n"
    $named = @($expected | Where-Object { $joined.Contains($_) }).Count
    return @{ generic = $generic; named = $named }
}

function Open-ChatGptUploadDialog {
    param([scriptblock]$RootProvider)
    $plus = Wait-ForElement $RootProvider {
        param($item)
        $item.Current.AutomationId -eq 'composer-plus-btn' -or $item.Current.Name -eq '添加文件等'
    } 30
    if (-not $plus) {
        throw 'ChatGPT 页面没有找到“添加文件”等按钮，请确认账号已登录且位于新对话输入页。'
    }
    Invoke-OrClick $plus
    $uploadText = Wait-ForElement $RootProvider {
        param($item)
        $item.Current.Name -in @('添加照片和文件', '从电脑上传', 'Add photos & files', 'Upload from computer')
    } 15
    if (-not $uploadText) {
        throw 'ChatGPT 附件菜单没有出现“添加照片和文件”。'
    }
    # The parent group spans the full popover width and its center can land on
    # a non-interactive area. Click the visible label itself.
    Invoke-OrClick $uploadText
}

function Open-GeminiUploadDialog {
    param([scriptblock]$RootProvider)
    $toolButton = Wait-ForElement $RootProvider {
        param($item)
        $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
            $item.Current.Name -in @('上传和工具', 'Upload and tools')
    } 30
    if (-not $toolButton) {
        throw 'Gemini 页面没有找到“上传和工具”按钮，请确认账号已登录且位于对话输入页。'
    }
    Invoke-OrClick $toolButton
    $uploadItem = Wait-ForElement $RootProvider {
        param($item)
        $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem -and
            $item.Current.Name -match '^(上传文件|Upload files)'
    } 15
    if (-not $uploadItem) {
        throw 'Gemini 上传菜单没有出现“上传文件”。'
    }
    Invoke-OrClick $uploadItem
}

function Confirm-Attachments {
    param(
        [scriptblock]$RootProvider,
        [string]$PluginId,
        [string[]]$Files,
        [hashtable]$Baseline,
        [int]$TimeoutSeconds = 90
    )
    if (-not $Files.Count) {
        return 0
    }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $snapshot = Get-AttachmentSnapshot $RootProvider $PluginId $Files
            if ($snapshot.named -eq $Files.Count -or
                ($snapshot.generic - $Baseline.generic) -ge $Files.Count) {
                return $Files.Count
            }
        } catch {
            # Retry while the site replaces upload preview nodes.
        }
        Start-Sleep -Milliseconds 500
    }
    return 0
}

function Set-ExactPrompt {
    param(
        [scriptblock]$RootProvider,
        [string]$PluginId,
        [string]$Prompt
    )
    $editor = Find-PromptEditor $RootProvider $PluginId 30
    if (-not $editor) {
        throw '官方网页没有找到提示词输入框。'
    }
    $valuePattern = $null
    if (-not $editor.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
        throw '官方网页提示词输入框不支持安全的原文写入。'
    }
    $valuePattern.SetValue($Prompt)
    Start-Sleep -Milliseconds 350
    $readBack = [string]$valuePattern.Current.Value
    if ($readBack -ne $Prompt) {
        throw '提示词写入后校验不一致，为避免误发已停止提交。'
    }
    return $editor
}

function Submit-Prompt {
    param(
        [scriptblock]$RootProvider,
        [string]$PluginId
    )
    $button = Wait-ForElement $RootProvider {
        param($item)
        if ($item.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button -or -not $item.Current.IsEnabled) {
            return $false
        }
        if ($PluginId -eq 'gpt-creator' -and $item.Current.AutomationId -eq 'composer-submit-button') {
            return $true
        }
        return $item.Current.Name -match '^(发送消息|发送提示|Send message|Send prompt|发送)$'
    } 20
    if (-not $button) {
        throw '附件与提示词已准备完成，但没有找到可用的发送按钮；为避免误操作未提交。'
    }
    Invoke-OrClick $button
}

try {
    $resolvedRequest = [IO.Path]::GetFullPath($RequestPath)
    if (-not (Test-Path -LiteralPath $resolvedRequest -PathType Leaf)) {
        throw '浏览器接力请求文件不存在。'
    }
    $request = Get-Content -Raw -Encoding UTF8 -LiteralPath $resolvedRequest | ConvertFrom-Json
    $pluginId = [string]$request.pluginId
    if ($pluginId -notin @('gemini-creator', 'gpt-creator')) {
        throw '该浏览器插件没有启用自动附件接力。'
    }
    $prompt = [string]$request.prompt
    if ([string]::IsNullOrWhiteSpace($prompt)) {
        throw '提示词不能为空。'
    }
    $files = @($request.files | ForEach-Object { [IO.Path]::GetFullPath([string]$_) })
    $prepareOnly = $false
    if ($request.PSObject.Properties.Name -contains 'prepareOnly') {
        $prepareOnly = [bool]$request.prepareOnly
    }
    if ($files.Count -gt 4) {
        throw '参考图最多 4 张。'
    }
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "参考图文件不存在：$([IO.Path]::GetFileName($file))"
        }
    }

    $edge = Get-EdgeWindow
    [HuahaiBrowserNative]::SetForegroundWindow($edge.MainWindowHandle) | Out-Null
    $rootProvider = { Get-EdgeRoot $edge }
    Select-OfficialTab (& $rootProvider) $pluginId

    $editorReady = Wait-ForElement $rootProvider {
        param($item)
        $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and (
            ($pluginId -eq 'gpt-creator' -and ($item.Current.AutomationId -eq 'prompt-textarea' -or $item.Current.Name -match 'ChatGPT')) -or
            ($pluginId -eq 'gemini-creator' -and $item.Current.Name -match 'Gemini.*输入提示|为 Gemini 输入提示|Enter a prompt')
        )
    } 45
    if (-not $editorReady) {
        throw '官方网页未进入可输入状态；请确认账号已登录后重试。'
    }

    if ($files.Count) {
        $baseline = Get-AttachmentSnapshot $rootProvider $pluginId $files
        if ($pluginId -eq 'gpt-creator') {
            Open-ChatGptUploadDialog $rootProvider
        } else {
            Open-GeminiUploadDialog $rootProvider
        }
        $dialog = $null
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        while ([DateTime]::UtcNow -lt $deadline -and -not $dialog) {
            $dialog = Find-FileDialog
            if (-not $dialog) {
                Start-Sleep -Milliseconds 250
            }
        }
        if (-not $dialog) {
            throw '点击上传后没有出现 Windows 文件选择窗口。'
        }
        Set-FileDialogPaths $dialog $files
        $confirmed = Confirm-Attachments $rootProvider $pluginId $files $baseline 120
        if ($confirmed -ne $files.Count) {
            throw "官网没有确认全部附件（期望 $($files.Count) 张）；为避免退化成纯文字生成，已停止提交。"
        }
    } else {
        $confirmed = 0
    }

    Set-ExactPrompt $rootProvider $pluginId $prompt | Out-Null
    if ($prepareOnly) {
        Write-HandoffResult $true '参考图与原提示词已在官网完成校验（未发送）' @{
            pluginId = $pluginId
            attachmentCount = $confirmed
            expectedAttachmentCount = $files.Count
            promptVerified = $true
            submitted = $false
            preparedOnly = $true
        }
    }
    Submit-Prompt $rootProvider $pluginId
    Write-HandoffResult $true '参考图与原提示词已提交到官方网页' @{
        pluginId = $pluginId
        attachmentCount = $confirmed
        expectedAttachmentCount = $files.Count
        promptVerified = $true
        submitted = $true
    }
} catch {
    Write-HandoffResult $false ([string]$_.Exception.Message) @{
        submitted = $false
    } 1
}
