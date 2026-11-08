import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少设计预览挂载点 #root')
createRoot(root).render(<StrictMode><App /></StrictMode>)
