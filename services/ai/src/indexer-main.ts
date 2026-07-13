// Indexer entry point — a separate process from the API server so the frozen
// demo backend (src/index.ts) is untouched. Run: pnpm indexer
import 'dotenv/config'
import { startIndexer } from './indexer'

startIndexer()
