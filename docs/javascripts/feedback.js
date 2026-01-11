// Feedback widget - sends to Rails app
document$.subscribe(function() {
  var feedback = document.forms.feedback
  if (typeof feedback === "undefined") return

  feedback.hidden = false

  feedback.addEventListener("submit", function(ev) {
    ev.preventDefault()

    var page = document.location.pathname
    var data = ev.submitter.getAttribute("data-md-value")

    // Only submit negative feedback (thumbs down) to create issues
    // Positive feedback just shows the thank you note
    if (data === "0") {
      // Derive Rails app URL from docs URL (support.X.com -> X.com)
      var railsHost = window.location.hostname.replace(/^support\./, '')
      var railsUrl = window.location.protocol + '//' + railsHost

      fetch(railsUrl + "/docs/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          page_path: page,
          rating: parseInt(data)
        })
      }).catch(function(err) {
        console.error("Feedback submission failed:", err)
      })
    }

    // Show thank you note
    feedback.firstElementChild.disabled = true
    var note = feedback.querySelector(
      ".md-feedback__note [data-md-value='" + data + "']"
    )
    if (note) note.hidden = false
  })
})
