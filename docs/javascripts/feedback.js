// Feedback widget - sends to Rails app with optional comment
document$.subscribe(function() {
  var feedback = document.forms.feedback
  if (typeof feedback === "undefined") return

  feedback.hidden = false

  // Create comment form elements using safe DOM methods
  var commentForm = document.createElement("div")
  commentForm.className = "md-feedback__comment"
  commentForm.hidden = true
  commentForm.style.cssText = "margin-top: 1rem; max-width: 400px;"

  var label = document.createElement("label")
  label.textContent = "What could be improved?"
  label.style.cssText = "display: block; margin-bottom: 0.5rem; font-weight: 600;"
  label.setAttribute("for", "feedback-comment")

  var textarea = document.createElement("textarea")
  textarea.id = "feedback-comment"
  textarea.rows = 3
  textarea.placeholder = "Tell us what's missing or unclear..."
  textarea.style.cssText = "width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.875rem;"

  var buttonContainer = document.createElement("div")
  buttonContainer.style.cssText = "margin-top: 0.5rem; display: flex; gap: 0.5rem;"

  var submitBtn = document.createElement("button")
  submitBtn.type = "button"
  submitBtn.id = "feedback-submit"
  submitBtn.textContent = "Submit"
  submitBtn.style.cssText = "padding: 0.5rem 1rem; background: #4A6FA5; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;"

  var skipBtn = document.createElement("button")
  skipBtn.type = "button"
  skipBtn.id = "feedback-skip"
  skipBtn.textContent = "Skip"
  skipBtn.style.cssText = "padding: 0.5rem 1rem; background: #f3f4f6; color: #374151; border: none; border-radius: 4px; cursor: pointer;"

  buttonContainer.appendChild(submitBtn)
  buttonContainer.appendChild(skipBtn)
  commentForm.appendChild(label)
  commentForm.appendChild(textarea)
  commentForm.appendChild(buttonContainer)
  feedback.appendChild(commentForm)

  var pagePath = document.location.pathname
  var railsHost = window.location.hostname.replace(/^support\./, '')
  var railsUrl = window.location.protocol + '//' + railsHost

  function submitFeedback(comment) {
    return fetch(railsUrl + "/docs/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        path: pagePath,
        comment: comment || null
      })
    })
  }

  function showThankYou() {
    commentForm.hidden = true
    feedback.firstElementChild.disabled = true
    var note = feedback.querySelector(".md-feedback__note [data-md-value='0']")
    if (note) note.hidden = false
  }

  feedback.addEventListener("submit", function(ev) {
    ev.preventDefault()
    var data = ev.submitter.getAttribute("data-md-value")

    if (data === "1") {
      // Thumbs up - just show thank you
      feedback.firstElementChild.disabled = true
      var note = feedback.querySelector(".md-feedback__note [data-md-value='1']")
      if (note) note.hidden = false
    } else if (data === "0") {
      // Thumbs down - show comment form
      feedback.firstElementChild.disabled = true
      commentForm.hidden = false
      textarea.focus()
    }
  })

  // Submit with comment
  submitBtn.addEventListener("click", function() {
    var comment = textarea.value.trim()
    submitFeedback(comment)
      .then(showThankYou)
      .catch(function(err) {
        console.error("Feedback submission failed:", err)
        showThankYou() // Still show thank you even on error
      })
  })

  // Skip comment
  skipBtn.addEventListener("click", function() {
    submitFeedback(null)
      .then(showThankYou)
      .catch(function(err) {
        console.error("Feedback submission failed:", err)
        showThankYou()
      })
  })
})
