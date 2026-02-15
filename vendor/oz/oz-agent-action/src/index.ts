import * as process from 'process'
import * as path from 'path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'

// Run Oz agent.
async function runAgent(): Promise<void> {
  const channel = core.getInput('oz_channel')
  const prompt = core.getInput('prompt')
  const savedPrompt = core.getInput('saved_prompt')
  const skill = core.getInput('skill')

  const model = core.getInput('model')
  const name = core.getInput('name')
  const mcp = core.getInput('mcp')

  if (!prompt && !savedPrompt && !skill) {
    throw new Error('Either `prompt`, `saved_prompt`, or `skill` must be provided')
  }

  const apiKey = core.getInput('oz_api_key') || core.getInput('warp_api_key')
  if (!apiKey) {
    throw new Error('`oz_api_key` must be provided (or `warp_api_key` as a deprecated alias).')
  }

  const cliPath = core.getInput('oz_cli_path')
  let command: string
  if (cliPath) {
    command = cliPath
  } else {
    // We intentionally do not download from Warp infrastructure by default.
    // If you want automated installation, provide an explicit URL to a .deb you host.
    await installOz(core.getInput('oz_cli_download_url'))
    command = channel === 'preview' ? 'oz-preview' : 'oz'
  }

  const args = ['agent', 'run']

  if (prompt) {
    args.push('--prompt', prompt)
  }

  if (savedPrompt) {
    args.push('--saved-prompt', savedPrompt)
  }

  if (skill) {
    args.push('--skill', skill)
  }

  if (model) {
    args.push('--model', model)
  }

  if (name) {
    args.push('--name', name)
  }

  if (mcp) {
    args.push('--mcp', mcp)
  }

  const cwd = core.getInput('cwd')
  if (cwd) {
    args.push('--cwd', cwd)
  }
  const profile = core.getInput('profile')
  if (profile) {
    args.push('--profile', profile)
  } else {
    args.push('--sandboxed')
  }

  const outputFormat = core.getInput('output_format')
  if (outputFormat) {
    args.push('--output-format', outputFormat)
  }

  const shareRecipients = core.getMultilineInput('share')
  if (shareRecipients) {
    for (const recipient of shareRecipients) {
      args.push('--share', recipient)
    }
  }

  // In debug mode, show Oz logs on stderr.
  if (core.isDebug()) {
    args.push('--debug')
  }

  let execResult
  try {
    execResult = await exec.getExecOutput(command, args, {
      env: {
        ...process.env,
        OZ_API_KEY: apiKey,
        WARP_API_KEY: apiKey, // Backward-compat for older CLIs
      }
    })
  } catch (error) {
    throw error
  }

  core.setOutput('agent_output', execResult.stdout)
}

// Install the Oz CLI, using the specified channel and version.
async function installOz(debUrl: string): Promise<void> {
  await core.group('Installing Oz', async () => {
    if (!debUrl) {
      throw new Error('No oz CLI configured. Set `oz_cli_path` or provide `oz_cli_download_url`.')
    }
    const ozDeb = await downloadOzDeb(debUrl)
    // Install the .deb file, and then use apt-get to install any dependencies.
    await exec.exec('sudo', ['dpkg', '-i', ozDeb])
    await exec.exec('sudo', ['apt-get', '-f', 'install'])
  })
}

// Download the .deb file for the Oz CLI from an explicit URL.
async function downloadOzDeb(debUrl: string): Promise<string> {
  if (process.platform !== 'linux') {
    throw new Error(
      `Only Linux runners are supported - the current platform is ${process.platform}`
    )
  }

  const url = new URL(debUrl)
  const cacheVersion = `explicit-${url.hostname}${url.pathname}`
  let cachedDeb = tc.find('oz', cacheVersion.substring(0, 200))
  if (!cachedDeb) {
    core.debug(`Downloading from ${debUrl}...`)
    const downloadedDeb = await tc.downloadTool(debUrl)
    cachedDeb = await tc.cacheFile(downloadedDeb, 'oz.deb', 'oz', cacheVersion.substring(0, 200))
  } else {
    core.debug('Using cached .deb package')
  }
  return path.join(cachedDeb, 'oz.deb')
}

try {
  await runAgent()
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(error.message)
  } else {
    core.setFailed(String(error))
  }
}
