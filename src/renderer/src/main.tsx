import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

document.body.dataset.platform = window.swift.platform

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
