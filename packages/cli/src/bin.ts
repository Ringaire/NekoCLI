#!/usr/bin/env node
import { main } from './cli/entry.js'
main().catch((err) => { console.error(err); process.exit(1) })
