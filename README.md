# ifcjs - InBIM IFC Viewer

A web-based 3D IFC (Industry Foundation Classes) Viewer built with React, Three.js, and [@thatopen](https://github.com/ThatOpen) components.

## Overview

This project provides a robust and interactive way to load, visualize, and interact with IFC files directly in the browser. It's built with modern web technologies and leverages the power of Three.js for 3D rendering and That Open Company's libraries for IFC parsing and management.

## Features

- **IFC Model Loading**: Load `.ifc` files directly from your local filesystem.
- **3D Visualization**: High-performance 3D rendering using Three.js.
- **Interactive Navigation**: Intuitive camera controls (orbit, pan, zoom).
- **Element Selection**: Click on elements within the model to select them (highlighter integration).
- **Property Inspection**: View the properties and metadata of selected IFC elements in a dedicated side panel.
- **Responsive UI**: A clean, modern user interface built with React.
- **Componentized Architecture**: The viewer is broken down into modular React components (`IfcViewer`, `PropertyPanel`, `Header`, etc.) and custom hooks (`useIfcEngine`, `useModelLoader`) for maintainability.

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **3D Engine**: [Three.js](https://threejs.org/)
- **IFC Core**:
  - `@thatopen/components`
  - `@thatopen/components-front`
  - `@thatopen/fragments`
  - `web-ifc`
- **Styling**: Custom CSS (available in `src/App.css` and `src/index.css`)

## Project Structure

```text
ifcjs/
├── public/              # Static assets (WASM files for web-ifc)
├── src/
│   ├── components/      # React UI components (Header, IfcViewer, PropertyPanel, etc.)
│   ├── contexts/        # React contexts (e.g., SelectionContext)
│   ├── hooks/           # Custom React hooks (useIfcEngine, useModelLoader)
│   ├── services/        # Core engine initialization and management
│   ├── utils/           # Utility functions (logger, fragment helpers)
│   ├── App.jsx          # Main application component
│   └── main.jsx         # Application entry point
├── package.json         # Project dependencies and scripts
└── vite.config.js       # Vite configuration
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- `npm` or `yarn`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/amirandaspace/inbim_ifc.git
   cd inbim_ifc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Ensure WASM files are available:
   The project requires the `web-ifc.wasm` and `web-ifc-mt.wasm` files to function. These are typically copied to the `public/` directory during the build process using `vite-plugin-static-copy` (as configured in `vite.config.js`).

### Running the Development Server

```bash
npm run dev
```

This will start the Vite development server. Open your browser and navigate to the local URL provided (usually `http://localhost:5173`).

### Building for Production

```bash
npm run build
```

The compiled assets will be placed in the `dist/` folder.

## Usage

1. Open the application in your browser.
2. Click the "Load IFC File" button in the header.
3. Select a valid `.ifc` file from your computer.
4. Wait for the model to load and process.
5. Use your mouse to interact with the 3D view:
   - **Left Click + Drag**: Rotate (Orbit)
   - **Right Click + Drag**: Pan
   - **Scroll Wheel**: Zoom
6. Click on elements within the model to select them and view their properties in the side panel.

## License

[MIT License](LICENSE) (or specify your license here)
