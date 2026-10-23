(() => {
  const safeUrl = (value) => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      if (url.origin === window.location.origin || url.protocol === "https:") return url.href;
    } catch (_) {}
    return null;
  };

  const showMessage = (container, message, isError = false) => {
    container.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "posts-empty";
    empty.textContent = message;
    if (isError) empty.setAttribute("data-error", "true");
    container.append(empty);
  };

  const createPostCard = (post) => {
    const card = document.createElement("article");
    card.className = "post-card";
    const target = safeUrl(post.target_url);
    const content = document.createElement(target ? "a" : "div");
    content.className = "post-card-link";
    if (target) {
      content.href = target;
      if (new URL(target).origin !== window.location.origin) {
        content.target = "_blank";
        content.rel = "noopener noreferrer";
      }
    }

    const category = post.category || "Info";
    const cover = document.createElement("div");
    cover.className = "post-cover";
    cover.dataset.category = category.toUpperCase();
    const imageUrl = safeUrl(post.image_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      cover.append(image);
    } else {
      const label = document.createElement("span");
      label.className = "post-cover-label";
      label.textContent = category.toUpperCase();
      cover.append(label);
    }

    const body = document.createElement("div");
    body.className = "post-card-body";
    const tag = document.createElement("span");
    tag.className = "post-category";
    tag.textContent = category;
    const title = document.createElement("h3");
    title.textContent = post.title;
    const summary = document.createElement("p");
    summary.className = "post-summary";
    summary.textContent = post.summary || "Buka post ini untuk melihat informasi selengkapnya.";
    const date = document.createElement("time");
    date.className = "post-date";
    date.dateTime = post.published_at;
    date.textContent = new Date(post.published_at).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta"
    });
    body.append(tag, title, summary, date);
    content.append(cover, body);
    card.append(content);
    return card;
  };

  async function load(client) {
    const container = document.getElementById("latestPosts");
    if (!container) return;
    showMessage(container, "Memuat post terbaru...");
    const { data, error } = await client
      .from("site_posts")
      .select("id, title, summary, category, image_url, target_url, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(3);

    if (error) {
      showMessage(container, "Post terbaru belum dapat dimuat. Pastikan tabel post sudah disiapkan di Supabase.", true);
      return;
    }
    if (!data || data.length === 0) {
      showMessage(container, "Belum ada post yang dipublikasikan. Post akan tampil di sini setelah ditambahkan melalui Supabase.");
      return;
    }
    container.replaceChildren(...data.map(createPostCard));
  }

  window.BoyLatestPosts = { load };
})();
