import * as Components from '@thatopen/components';

if (Components.SimpleWorld) {
    console.log('--- SimpleWorld Source ---');
    // Check if it has a meshes property
    const world = new Components.SimpleWorld(new Components.Components());
    console.log('World meshes:', world.meshes);
} else {
    console.log('SimpleWorld not found directly');
    // Try to find it via Worlds component
    const comps = new Components.Components();
    const worlds = comps.get(Components.Worlds);
    const world = worlds.create();
    console.log('Created World meshes:', world.meshes);
}
