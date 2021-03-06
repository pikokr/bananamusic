import { CommandClient } from '@pikostudio/command.ts'
import { Collection } from 'discord.js'
import { ShardingManager } from 'discord.js'
import Dokdo from 'dokdo'
import { Manager } from 'erela.js'
import MusicExt from './extensions/music'

const config = require('../config.json')

declare module 'discord.js' {
  interface Client {
    config: typeof config
    dokdo: Dokdo
    music: Manager
    controllerMap: Collection<string, Message>
  }
}

if (process.env.SHARDING_MANAGER) {
  const client = new CommandClient(
    {
      watch: true,
      owners: 'auto',
      commandHandler: {
        prefix: config.prefix,
      },
      currentDir: __dirname,
    },
    {
      restTimeOffset: 0,
    },
  )
  client.controllerMap = new Collection()

  client.music = new Manager({
    send: (id, payload) => {
      const guild = client.guilds.cache.get(id)
      if (guild) guild.shard.send(payload)
    },
    nodes: config.nodes,
  })

  client.music.on('nodeConnect', (node) => {
    console.log(`Node ${node.options.host}:${node.options.port} connected.`)
  })
  client.music.on('nodeError', (node, error) => {
    console.log(
      `Node ${node.options.host}:${node.options.port} encounted an error: ${error.message}`,
    )
  })
  client.music.on('queueEnd', (player) => {
    player.destroy()
  })

  client.music.on('nodeRaw', async (payload: any) => {
    const Music = require('./extensions/music')?.default ?? MusicExt
    if (payload.op === 'playerUpdate') {
      const guild = client.guilds.cache.get(payload.guildId)
      if (guild) {
        let m = client.controllerMap.get(guild.id)
        if (m?.deleted) {
          client.controllerMap.set(
            guild.id,
            await m.channel.send(Music.getNowPlayingEmbed(guild)).then((r) => {
              Music.initController(r)
              return r
            }),
          )
          return
        }
        if (m) {
          m.edit(Music.getNowPlayingEmbed(guild)).catch(async () => {
            const msg = await m?.channel.send(Music.getNowPlayingEmbed(guild))!
            client.controllerMap.set(guild.id, msg)
            await Music.initController(msg)
            return
          })
        }
      }
    }
  })

  client.config = config
  client.loadExtensions('extensions/index')
  client.loadExtensions('extensions/owner')
  client.loadExtensions('extensions/music')
  client.login(config.token)
} else {
  const manager = new ShardingManager(__filename, {
    execArgv: __filename.endsWith('.ts') ? ['-r', 'ts-node/register'] : [],
    token: config.token,
  })
  manager.spawn()
}
