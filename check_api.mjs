import * as OBC from '@thatopen/components';

console.log('--- Checking OBC Components ---');
console.log('IfcRelationsIndexer:', OBC.IfcRelationsIndexer);
console.log('Classifier:', OBC.Classifier);
console.log('Hider:', OBC.Hider);
console.log('FragmentsManager:', OBC.FragmentsManager);

const components = new OBC.Components();
try {
    const indexer = components.get(OBC.IfcRelationsIndexer);
    console.log('Successfully got IfcRelationsIndexer instance');
} catch (e) {
    console.log('Failed to get IfcRelationsIndexer:', e.message);
}
