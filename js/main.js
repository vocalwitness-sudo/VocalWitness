// Select the elements from the HTML
const message = document.getElementById('message');
const button = document.getElementById('changeButton');

// Add an event listener to the button
button.addEventListener('click', () => {
    message.textContent = "You clicked the button!";
    message.style.color = "blue";
});
