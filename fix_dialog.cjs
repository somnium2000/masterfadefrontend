const fs = require('fs');
const path = 'src/features/admin/pages/AdminMasterPuntosPage.jsx';
const content = fs.readFileSync(path, 'utf8');

const target = `<DialogHeader>
            <DialogTitle>Migración manual de puntos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--mf-text-2)]">Esta acción solo se puede realizar una vez por cliente.</p>`;

const replacement = `<DialogHeader>
            <DialogTitle>Migración manual de puntos</DialogTitle>
            <DialogDescription>Esta acción solo se puede realizar una vez por cliente.</DialogDescription>
          </DialogHeader>`;

if (content.includes(target)) {
    const newContent = content.replace(target, replacement);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Target not found!");
    // Maybe the characters are different (spaces vs tabs, \r\n vs \n, etc)
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedTarget = target.replace(/\r\n/g, '\n');
    if (normalizedContent.includes(normalizedTarget)) {
        const newContent = normalizedContent.replace(normalizedTarget, replacement);
        fs.writeFileSync(path, newContent, 'utf8');
        console.log("Replaced successfully with normalized newlines!");
    } else {
        console.log("Still not found. Looking for snippets...");
        const snippet = 'Esta acción solo se puede realizar una vez por cliente';
        console.log("Contains snippet:", content.includes(snippet));
    }
}
