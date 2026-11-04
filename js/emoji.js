/** A small emoji picker for the chat inputs. */
export const EMOJIS = ["😀", "😂", "🥰", "😍", "😎", "🤔", "😢", "😡", "😱", "😴", "🤝", "👋", "👍", "👎", "👏", "🙏", "💪", "🙌", "🔥", "✨", "💜", "💖", "❤️", "🎉", "🥕", "🐰", "⛏️", "💎", "🪙", "🌈", "⭐", "🌙", "☕", "🍀"];
export function emojiPicker(input) {
  const pop = document.createElement("div"), toggle = document.createElement("button");
  pop.className = "emoji-pop hidden"; toggle.className = "emoji-btn"; toggle.type = "button"; toggle.textContent = "😊"; toggle.title = "Emoji";
  EMOJIS.forEach((e) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = e;
    b.addEventListener("click", () => {
      const s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? s;
      input.value = (input.value.slice(0, s) + e + input.value.slice(t)).slice(0, input.maxLength || 300);
      input.focus(); input.setSelectionRange(s + e.length, s + e.length); pop.classList.add("hidden");
    });
    pop.append(b);
  });
  toggle.addEventListener("click", () => pop.classList.toggle("hidden"));
  return { toggle, pop };
}
