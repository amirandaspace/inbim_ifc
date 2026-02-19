import * as THREE from 'three';
import * as WEBIFC from 'web-ifc';
import * as OBC from '@thatopen/components';
import { FragmentsManager } from '@thatopen/fragments';
import fs from 'fs';
import path from 'path';

// Mock browser environment for OBC
global.window = {
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
};
global.document = {
    createElement: () => ({ style: {}, addEventListener: () => {} }),
    body: { appendChild: () => {} },
};
global.HTMLElement = class {};
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = () => {};

async function inspect() {
    console.log('--- Inspecting Fragment Geometry ---');
    
    // Setup components
    const components = new OBC.Components();
    const fragments = components.get(OBC.FragmentsManager);
    const ifcLoader = components.get(OBC.IfcLoader);
    
    await ifcLoader.setup({
        wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.75/',
            absolute: true,
        },
    });

    // Find an IFC file to load
    const files = fs.readdirSync('.');
    const ifcFile = files.find(f => f.endsWith('.ifc'));
    
    if (!ifcFile) {
        console.log('No .ifc file found in current directory.');
        return;
    }

    console.log('Loading:', ifcFile);
    const buffer = fs.readFileSync(ifcFile);
    const uint8 = new Uint8Array(buffer);
    
    const model = await ifcLoader.load(uint8, false, ifcFile);
    console.log('Model loaded. Fragments:', fragments.list.size);

    for (const [id, fragment] of fragments.list) {
        const mesh = fragment.mesh;
        console.log(`Fragment ${id}:`);
        console.log(`- Type: ${mesh.type}`);
        console.log(`- Count: ${mesh.count} (Instances)`);
        console.log(`- Geometry Type: ${mesh.geometry.type}`);
        
        const pos = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        
        console.log(`- Vertices: ${pos ? pos.count : 'None'}`);
        console.log(`- Item Size: ${pos ? pos.itemSize : 'N/A'}`);
        console.log(`- Index: ${index ? index.count : 'None'}`);
        console.log(`- BoundsTree: ${mesh.geometry.boundsTree ? 'Present' : 'Absent'}`);
        
        // Check first few vertices
        if (pos && pos.count > 0) {
            console.log(`- First Vertex: (${pos.getX(0)}, ${pos.getY(0)}, ${pos.getZ(0)})`);
        }
        
        // Stop after first fragment
        break;
    }
    
    components.dispose();
}

inspect().catch(err => console.error(err));
