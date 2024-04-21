setInterval(async () => {
    const r = await fetch("http://localhost:8146");

    console.log(r.ok, r.status, r.statusText);
}, 100);
