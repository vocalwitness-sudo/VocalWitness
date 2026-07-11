// window-registry.js
export const registerGlobalFunctions = (functions) => {
    Object.keys(functions).forEach(key => {
        window[key] = functions[key];
    });
};
